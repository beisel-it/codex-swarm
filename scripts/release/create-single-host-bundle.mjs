#!/usr/bin/env node

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const repoRoot = process.cwd();
const cliPackage = JSON.parse(
  await readFile(path.join(repoRoot, "apps/cli/package.json"), "utf8"),
);
const version = cliPackage.version;
const bundleBaseName = `codex-swarm-single-host-${version}`;
const distRoot = path.join(repoRoot, "dist", "release");
const stageParent = await mkdtemp(
  path.join(os.tmpdir(), "codex-swarm-release-"),
);
const stageRoot = path.join(stageParent, bundleBaseName);
const outputTarball = path.join(distRoot, `${bundleBaseName}.tar.gz`);
const releaseMetadata = {
  version,
  bundle: `${bundleBaseName}.tar.gz`,
  repository: "beisel-it/codex-swarm",
  commit: process.env.GITHUB_SHA ?? null,
  createdAt: new Date().toISOString(),
};

const bundlePaths = [
  "apps/api/package.json",
  "apps/api/dist/src",
  "apps/tui/package.json",
  "apps/tui/dist/index.js",
  "apps/tui/dist/data.js",
  "apps/tui/dist/mock-data.js",
  "apps/tui/dist/view-model.js",
  "frontend/dist",
  "ops/deploy/write-frontend-runtime-config.mjs",
];

const runtimeDependencies = {
  "@fastify/static": "^8.3.0",
  "@openai/agents": "^0.8.1",
  "drizzle-orm": "^0.44.5",
  fastify: "^5.6.1",
  "fastify-plugin": "^5.0.1",
  ink: "^6.8.0",
  pg: "^8.16.3",
  react: "^19.2.4",
  zod: "^4.1.5",
};

await rm(distRoot, { recursive: true, force: true });
await mkdir(distRoot, { recursive: true });
await mkdir(stageRoot, { recursive: true });

for (const relativePath of bundlePaths) {
  const source = path.join(repoRoot, relativePath);
  const destination = path.join(stageRoot, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await run("cp", ["-a", source, destination]);
}

await writeFile(
  path.join(stageRoot, "package.json"),
  `${JSON.stringify(
    {
      name: "codex-swarm-single-host-runtime",
      private: true,
      type: "module",
      dependencies: runtimeDependencies,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

await run(
  "npm",
  ["install", "--omit=dev", "--ignore-scripts", "--no-fund", "--no-audit"],
  stageRoot,
);
await runShell(
  "rm -rf node_modules/.bin && " +
    "find node_modules -type d \\( -name test -o -name tests -o -name __tests__ \\) -prune -exec rm -rf {} + && " +
    "find node_modules -type f \\( -name '*.test.*' -o -name '*.spec.*' \\) -delete",
  stageRoot,
);
await wireInternalPackage(
  stageRoot,
  "contracts",
  path.join(repoRoot, "packages", "contracts", "dist", "src"),
);
await wireInternalPackage(
  stageRoot,
  "orchestration",
  path.join(repoRoot, "packages", "orchestration", "dist", "src"),
);
await wireInternalPackage(
  stageRoot,
  "worker",
  path.join(repoRoot, "apps", "worker", "dist", "src"),
);
await wireInternalPackage(
  stageRoot,
  "database",
  path.join(repoRoot, "packages", "database", "dist", "src"),
);

await writeFile(
  path.join(stageRoot, "codex-swarm-release.json"),
  `${JSON.stringify(releaseMetadata, null, 2)}\n`,
  "utf8",
);

await run(
  "tar",
  ["-czf", outputTarball, "-C", stageParent, bundleBaseName],
  repoRoot,
);
console.log(outputTarball);

async function wireInternalPackage(stageRoot, packageName, sourceDir) {
  const scopedDir = path.join(
    stageRoot,
    "node_modules",
    "@codex-swarm",
    packageName,
  );
  await mkdir(scopedDir, { recursive: true });
  await run("cp", ["-a", `${sourceDir}/.`, scopedDir], repoRoot);
  await writeFile(
    path.join(scopedDir, "package.json"),
    `${JSON.stringify(
      {
        name: `@codex-swarm/${packageName}`,
        type: "module",
        exports: "./index.js",
        main: "./index.js",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

async function run(command, args, cwd = repoRoot) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      cwd,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if ((code ?? 1) === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(" ")} failed with exit code ${code ?? 1}`,
        ),
      );
    });
  });
}

async function runShell(script, cwd = repoRoot) {
  await run("bash", ["-lc", script], cwd);
}
