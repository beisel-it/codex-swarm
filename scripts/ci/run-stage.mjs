import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const stage = process.argv[2];

if (!stage) {
  console.error("Usage: node ./scripts/ci/run-stage.mjs <stage>");
  process.exit(1);
}

const rootDir = process.cwd();
const ignoredDirs = new Set([
  ".git",
  ".next",
  ".turbo",
  ".vercel",
  "build",
  "coverage",
  "dist",
  "node_modules",
]);

function findPackageDirs(dir) {
  const packageDirs = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || ignoredDirs.has(entry.name)) {
      continue;
    }

    const nextDir = path.join(dir, entry.name);
    const packageJsonPath = path.join(nextDir, "package.json");

    try {
      if (statSync(packageJsonPath).isFile()) {
        packageDirs.push(nextDir);
        continue;
      }
    } catch {
      // Keep walking when the directory is not a package root.
    }

    packageDirs.push(...findPackageDirs(nextDir));
  }

  return packageDirs;
}

const packageDirs = findPackageDirs(rootDir);
const packageManagerCommand = process.env.npm_execpath
  ? {
      command: process.execPath,
      args: [process.env.npm_execpath],
    }
  : {
      command: "corepack",
      args: ["pnpm"],
    };
const runnablePackages = packageDirs
  .map((dir) => {
    const packageJson = JSON.parse(
      readFileSync(path.join(dir, "package.json"), "utf8"),
    );

    return {
      dir,
      name: packageJson.name ?? path.relative(rootDir, dir),
      hasScript: Boolean(packageJson.scripts?.[stage]),
    };
  })
  .filter((pkg) => pkg.hasScript);

if (runnablePackages.length === 0) {
  console.log(`No workspace packages expose a "${stage}" script. Skipping.`);
  process.exit(0);
}

console.log(
  `Running "${stage}" for ${runnablePackages.length} package(s): ${runnablePackages
    .map((pkg) => pkg.name)
    .join(", ")}`,
);

for (const pkg of runnablePackages) {
  console.log(`\n> ${pkg.name} (${path.relative(rootDir, pkg.dir)})`);

  const result = spawnSync(
    packageManagerCommand.command,
    [...packageManagerCommand.args, "--dir", pkg.dir, "run", stage],
    {
    cwd: rootDir,
    stdio: "inherit",
    env: process.env,
    },
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
