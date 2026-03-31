#!/usr/bin/env node

import { spawn } from "node:child_process";
import {
  access,
  cp,
  constants,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";
import {
  defaultInstallRoot,
  envContainsInstallPlaceholders,
  getSingleHostDataDirs,
  RELEASE_BUNDLE_ASSET_PREFIX,
  RELEASE_METADATA_FILE,
  renderSingleHostEnvTemplate,
  renderSystemdUnitTemplate,
  SINGLE_HOST_UNIT_NAMES,
} from "../lib/single-host.js";

type CommandResult = number | void | Promise<number | void>;

type SharedOptions = {
  installRoot: string | null;
  envFile: string;
};

type InstallOptions = SharedOptions & {
  installRoot: string;
  bundlePath: string | null;
  version: string | null;
  dryRun: boolean;
  yes: boolean;
  start: boolean;
};

const CLI_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(CLI_DIR, "..", "..");
const TEMPLATE_ROOT = path.join(PACKAGE_ROOT, "templates");
const GITHUB_REPO = "beisel-it/codex-swarm";

const HELP_TEXT = `codex-swarm

Usage:
  codex-swarm doctor [--install-root <path>] [--env-file <path>]
  codex-swarm install [--bundle <path> | --version <version>] [--install-root <path>] [--env-file <path>] [--dry-run] [--yes] [--start]
  codex-swarm api start [--install-root <path>]
  codex-swarm worker start [--install-root <path>]
  codex-swarm db migrate [--install-root <path>]
  codex-swarm tui [--install-root <path>]

Notes:
  - service commands run built release artifacts from an install root
  - install defaults to the latest GitHub Release bundle when neither --bundle nor --version is supplied
  - release 1 is optimized for private self-hosted single-host deployments
`;

async function main() {
  const [, , ...argv] = process.argv;
  const [command, ...rest] = argv;

  if (!command || command === "--help" || command === "help") {
    output.write(`${HELP_TEXT}\n`);
    process.exit(0);
  }

  let result: CommandResult;

  switch (command) {
    case "doctor":
      result = runDoctor(parseSharedOptions(rest));
      break;
    case "install":
      result = runInstall(parseInstallOptions(rest));
      break;
    case "api":
      result = runServiceCommand("api", rest);
      break;
    case "worker":
      result = runServiceCommand("worker", rest);
      break;
    case "db":
      result = runServiceCommand("db", rest);
      break;
    case "tui":
      result = runServiceCommand("tui", rest);
      break;
    default:
      output.write(`${HELP_TEXT}\n`);
      throw new Error(`Unknown command: ${command}`);
  }

  const exitCode = await result;
  process.exit(exitCode ?? 0);
}

function parseSharedOptions(argv: string[]): SharedOptions {
  let installRoot: string | null = null;
  let envFile = defaultEnvFile();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--install-root") {
      installRoot = path.resolve(requireValue(argv[index + 1], token));
      index += 1;
      continue;
    }

    if (token === "--env-file") {
      envFile = path.resolve(requireValue(argv[index + 1], token));
      index += 1;
      continue;
    }

    if (token === "--help" || token === "help") {
      output.write(`${HELP_TEXT}\n`);
      process.exit(0);
    }

    throw new Error(`Unknown option: ${token}`);
  }

  return { installRoot, envFile };
}

function parseInstallOptions(argv: string[]): InstallOptions {
  let installRoot: string | null = null;
  let envFile = defaultEnvFile();
  let bundlePath: string | null = null;
  let version: string | null = null;
  let dryRun = false;
  let yes = false;
  let start = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--install-root") {
      installRoot = path.resolve(requireValue(argv[index + 1], token));
      index += 1;
      continue;
    }

    if (token === "--env-file") {
      envFile = path.resolve(requireValue(argv[index + 1], token));
      index += 1;
      continue;
    }

    if (token === "--bundle") {
      bundlePath = path.resolve(requireValue(argv[index + 1], token));
      index += 1;
      continue;
    }

    if (token === "--version") {
      version = requireValue(argv[index + 1], token);
      index += 1;
      continue;
    }

    if (token === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (token === "--yes") {
      yes = true;
      continue;
    }

    if (token === "--start") {
      start = true;
      continue;
    }

    if (token === "--help" || token === "help") {
      output.write(`${HELP_TEXT}\n`);
      process.exit(0);
    }

    throw new Error(`Unknown option: ${token}`);
  }

  if (bundlePath && version) {
    throw new Error("Use either --bundle or --version, not both.");
  }

  return {
    installRoot: installRoot ?? defaultInstallRoot(),
    envFile,
    bundlePath,
    version,
    dryRun,
    yes,
    start,
  };
}

function requireValue(value: string | undefined, flag: string) {
  if (!value) {
    throw new Error(`${flag} requires a value`);
  }

  return value;
}

function defaultEnvFile() {
  return path.join(os.homedir(), ".config", "codex-swarm", "single-host.env");
}

async function runDoctor(options: SharedOptions) {
  const installRoot = options.installRoot ?? defaultInstallRoot();
  const releaseMetadataPath = path.join(installRoot, RELEASE_METADATA_FILE);
  const releaseMetadata =
    await readJsonFile<Record<string, unknown>>(releaseMetadataPath);
  const checks = await Promise.all([
    commandCheck("node"),
    commandCheck("docker"),
    commandCheck("systemctl"),
    commandCheck("loginctl"),
    commandCheck("codex"),
    commandCheck("tar"),
    fileCheck(options.envFile, "env file"),
    fileCheck(releaseMetadataPath, "release metadata"),
    fileCheck(
      path.join(installRoot, "apps", "api", "dist", "src", "server.js"),
      "api build",
    ),
    fileCheck(
      path.join(
        installRoot,
        "apps",
        "api",
        "dist",
        "src",
        "ops",
        "local-worker-daemon.js",
      ),
      "worker build",
    ),
    fileCheck(
      path.join(installRoot, "apps", "api", "dist", "src", "db", "migrate.js"),
      "db migrate build",
    ),
    fileCheck(
      path.join(installRoot, "apps", "tui", "dist", "index.js"),
      "tui build",
    ),
    fileCheck(
      path.join(installRoot, "frontend", "dist", "index.html"),
      "frontend build",
    ),
  ]);

  output.write("Codex Swarm doctor\n\n");
  output.write(`Install root: ${installRoot}\n`);
  output.write(`Env file: ${options.envFile}\n`);
  output.write(
    `Release metadata: ${releaseMetadata ? JSON.stringify(releaseMetadata) : "not found"}\n\n`,
  );

  for (const check of checks) {
    output.write(
      `${check.ok ? "OK" : "MISS"}  ${check.label}: ${check.detail}\n`,
    );
  }

  return checks.every((check) => check.ok) ? 0 : 1;
}

async function runInstall(options: InstallOptions) {
  output.write(
    [
      "Codex Swarm single-host installer",
      "",
      `- install root: ${options.installRoot}`,
      `- env file: ${options.envFile}`,
      `- source: ${options.bundlePath ? options.bundlePath : `github release (${options.version ?? "latest"})`}`,
      `- dry run: ${options.dryRun ? "yes" : "no"}`,
      `- start services: ${options.start ? "yes" : "no"}`,
      "",
    ].join("\n"),
  );

  const preflight = await Promise.all([
    commandCheck("node"),
    commandCheck("docker"),
    commandCheck("systemctl"),
    commandCheck("loginctl"),
    commandCheck("codex"),
    commandCheck("tar"),
  ]);

  for (const check of preflight) {
    output.write(
      `${check.ok ? "OK" : "MISS"}  ${check.label}: ${check.detail}\n`,
    );
  }
  output.write("\n");

  const failures = preflight.filter((check) => !check.ok);
  if (failures.length > 0) {
    throw new Error(
      `Preflight failed for ${failures.map((check) => check.label).join(", ")}`,
    );
  }

  if (!options.yes) {
    const confirmed = await confirm("Proceed with installer actions? [y/N] ");
    if (!confirmed) {
      output.write("Installation cancelled.\n");
      return 0;
    }
  }

  const configDir = path.dirname(options.envFile);
  const systemdDir = path.join(os.homedir(), ".config", "systemd", "user");
  const workersDir = path.join(configDir, "workers");
  const envTemplatePath = path.join(TEMPLATE_ROOT, "single-host.env.example");
  const renderedEnvTemplate = renderSingleHostEnvTemplate(
    await readFile(envTemplatePath, "utf8"),
  );
  const bundlePath =
    options.bundlePath ?? (await downloadReleaseBundle(options.version));

  output.write(`Bundle ready: ${bundlePath}\n`);

  if (options.dryRun) {
    output.write(`[dry-run] extract ${bundlePath} -> ${options.installRoot}\n`);
  } else {
    await installBundle(bundlePath, options.installRoot);
  }

  await mkdirIfNeeded(configDir, options.dryRun);
  await mkdirIfNeeded(systemdDir, options.dryRun);
  await mkdirIfNeeded(workersDir, options.dryRun);

  if (!(await fileExists(options.envFile))) {
    await writeWithDryRun(options.envFile, renderedEnvTemplate, options.dryRun);
    output.write(`Wrote env template to ${options.envFile}\n`);
  } else {
    output.write(`Kept existing env file at ${options.envFile}\n`);
  }

  for (const unitName of SINGLE_HOST_UNIT_NAMES) {
    const sourcePath = path.join(TEMPLATE_ROOT, "systemd-user", unitName);
    const targetPath = path.join(systemdDir, unitName);
    const rendered = renderSystemdUnitTemplate(
      await readFile(sourcePath, "utf8"),
      {
        installRoot: options.installRoot,
        envFile: options.envFile,
      },
    );
    await writeWithDryRun(targetPath, rendered, options.dryRun);
  }

  const currentEnv = await readFile(options.envFile, "utf8").catch(
    () => renderedEnvTemplate,
  );
  const hasPlaceholders = envContainsInstallPlaceholders(currentEnv);

  for (const dataDir of getSingleHostDataDirs(currentEnv)) {
    await mkdirIfNeeded(dataDir, options.dryRun);
  }

  await runShellCommand("systemctl", ["--user", "daemon-reload"], {
    cwd: options.installRoot,
    dryRun: options.dryRun,
    label: "reload systemd user units",
  });
  await runShellCommand(
    "systemctl",
    ["--user", "enable", "codex-swarm.target"],
    {
      cwd: options.installRoot,
      dryRun: options.dryRun,
      label: "enable codex-swarm.target",
    },
  );

  if (options.start) {
    if (hasPlaceholders) {
      throw new Error(
        `Refusing to start services while ${options.envFile} still contains placeholder values`,
      );
    }

    await runShellCommand(
      "systemctl",
      ["--user", "restart", "codex-swarm.target"],
      {
        cwd: options.installRoot,
        dryRun: options.dryRun,
        label: "restart codex-swarm.target",
      },
    );
  } else {
    output.write(
      `\nServices were not started. Edit ${options.envFile} and rerun with --start when ready.\n`,
    );
  }

  output.write("\nNext steps:\n");
  output.write(`- review ${options.envFile}\n`);
  output.write(
    `- run codex-swarm doctor --install-root ${options.installRoot} --env-file ${options.envFile}\n`,
  );
  if (!options.start) {
    output.write(
      `- rerun codex-swarm install --install-root ${options.installRoot} --env-file ${options.envFile} --start --yes\n`,
    );
  }
  return 0;
}

async function downloadReleaseBundle(version: string | null) {
  const normalizedVersion = version?.trim().toLowerCase() ?? null;
  const releaseInfo =
    normalizedVersion === null || normalizedVersion === "latest"
      ? await fetchLatestRelease()
      : await fetchReleaseByTag(`codex-swarm@${version}`);
  const asset = (
    releaseInfo.assets as Array<{ name: string; browser_download_url: string }>
  ).find(
    (candidate) =>
      candidate.name.startsWith(RELEASE_BUNDLE_ASSET_PREFIX) &&
      candidate.name.endsWith(".tar.gz"),
  );

  if (!asset) {
    throw new Error(
      `No ${RELEASE_BUNDLE_ASSET_PREFIX} bundle asset found on release ${releaseInfo.tag_name}`,
    );
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "codex-swarm-bundle-"));
  const targetPath = path.join(tempDir, asset.name);
  const response = await fetch(asset.browser_download_url, {
    headers: {
      "User-Agent": "codex-swarm-cli",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to download release bundle: ${response.status} ${response.statusText}`,
    );
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(targetPath, bytes);

  return targetPath;
}

async function fetchLatestRelease() {
  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "codex-swarm-cli",
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to fetch latest release: ${response.status} ${response.statusText}`,
    );
  }

  return response.json() as Promise<Record<string, any>>;
}

async function fetchReleaseByTag(tag: string) {
  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/releases/tags/${encodeURIComponent(tag)}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "codex-swarm-cli",
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to fetch release ${tag}: ${response.status} ${response.statusText}`,
    );
  }

  return response.json() as Promise<Record<string, any>>;
}

async function installBundle(bundlePath: string, installRoot: string) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "codex-swarm-install-"));
  await mkdir(path.dirname(installRoot), { recursive: true });
  const stagingRoot = await mkdtemp(
    path.join(path.dirname(installRoot), "codex-swarm-install-"),
  );
  const nextInstallRoot = path.join(stagingRoot, "bundle");

  try {
    await runShellCommand("tar", ["-xzf", bundlePath, "-C", tempDir], {
      cwd: process.cwd(),
      dryRun: false,
      label: "extract release bundle",
    });
    const entries = await readDirNames(tempDir);

    if (entries.length !== 1) {
      throw new Error(
        `Expected a single top-level directory in ${bundlePath}, found ${entries.length}`,
      );
    }

    const extractedRoot = path.join(tempDir, entries[0]!);
    await cp(extractedRoot, nextInstallRoot, { recursive: true });
    await rm(installRoot, { recursive: true, force: true });
    await rename(nextInstallRoot, installRoot);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
    await rm(stagingRoot, { recursive: true, force: true });
  }
}

async function runServiceCommand(group: string, argv: string[]) {
  if (group === "tui") {
    const shared = parseSharedOptions(argv);
    const installRoot = shared.installRoot ?? defaultInstallRoot();
    return runBuiltNodeEntry(
      path.join(installRoot, "apps", "tui", "dist", "index.js"),
    );
  }

  const [subcommand, ...rest] = argv;
  const shared = parseSharedOptions(rest);
  const installRoot = shared.installRoot ?? defaultInstallRoot();

  if (group === "api" && subcommand === "start") {
    return runBuiltNodeEntry(
      path.join(installRoot, "apps", "api", "dist", "src", "server.js"),
    );
  }

  if (group === "worker" && subcommand === "start") {
    return runBuiltNodeEntry(
      path.join(
        installRoot,
        "apps",
        "api",
        "dist",
        "src",
        "ops",
        "local-worker-daemon.js",
      ),
    );
  }

  if (group === "db" && subcommand === "migrate") {
    return runBuiltNodeEntry(
      path.join(installRoot, "apps", "api", "dist", "src", "db", "migrate.js"),
    );
  }

  output.write(`${HELP_TEXT}\n`);
  throw new Error(
    `Unknown command combination: ${group} ${subcommand ?? ""}`.trim(),
  );
}

async function runBuiltNodeEntry(entryPath: string) {
  await access(entryPath, constants.R_OK);
  return new Promise<number>((resolve, reject) => {
    const child = spawn(process.execPath, [entryPath], {
      stdio: "inherit",
      env: process.env,
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }

      resolve(code ?? 0);
    });
  });
}

async function commandCheck(command: string) {
  const result = await new Promise<{ ok: boolean; detail: string }>(
    (resolve) => {
      const child = spawn("sh", ["-lc", `command -v ${command}`], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let outputBuffer = "";
      child.stdout.on("data", (chunk) => {
        outputBuffer += chunk.toString("utf8");
      });

      child.on("error", () =>
        resolve({ ok: false, detail: "command lookup failed" }),
      );
      child.on("exit", (code) => {
        resolve({
          ok: code === 0,
          detail: code === 0 ? outputBuffer.trim() || "available" : "not found",
        });
      });
    },
  );

  return { label: command, ...result };
}

async function fileCheck(targetPath: string, label: string) {
  const ok = await fileExists(targetPath);
  return {
    label,
    ok,
    detail: ok ? targetPath : `missing at ${targetPath}`,
  };
}

async function fileExists(targetPath: string) {
  try {
    await access(targetPath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function mkdirIfNeeded(targetPath: string, dryRun: boolean) {
  if (dryRun) {
    output.write(`[dry-run] mkdir -p ${targetPath}\n`);
    return;
  }

  await mkdir(targetPath, { recursive: true });
}

async function writeWithDryRun(
  targetPath: string,
  contents: string,
  dryRun: boolean,
) {
  if (dryRun) {
    output.write(`[dry-run] write ${targetPath}\n`);
    return;
  }

  await writeFile(targetPath, contents, "utf8");
}

async function runShellCommand(
  command: string,
  args: string[],
  options: { cwd: string; dryRun: boolean; label: string },
) {
  if (options.dryRun) {
    output.write(`[dry-run] ${command} ${args.join(" ")} (${options.label})\n`);
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: "inherit",
      env: process.env,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if ((code ?? 0) === 0) {
        resolve();
        return;
      }

      reject(new Error(`${options.label} failed with exit code ${code ?? 1}`));
    });
  });
}

async function confirm(prompt: string) {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(prompt);
    return ["y", "yes"].includes(answer.trim().toLowerCase());
  } finally {
    rl.close();
  }
}

async function readJsonFile<T>(filePath: string) {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function readDirNames(dirPath: string) {
  return readdir(dirPath);
}

main().catch((error) => {
  output.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
