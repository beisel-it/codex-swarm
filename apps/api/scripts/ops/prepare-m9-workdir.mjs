import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const rootDir = resolve(process.env.M9_ROOT_DIR ?? ".ops/m9");
const runLabel =
  process.env.M9_RUN_LABEL ?? new Date().toISOString().replace(/[:.]/g, "-");
const runRoot = join(rootDir, runLabel);
const workspaceRoot = join(runRoot, "workspace");
const artifactsRoot = join(runRoot, "artifacts");
const screenshotsRoot = join(runRoot, "screenshots");
const logsRoot = join(runRoot, "logs");
const transcriptsRoot = join(runRoot, "transcripts");
const manifestPath = join(runRoot, "manifest.json");
const envPath = join(runRoot, "m9.env");

await mkdir(workspaceRoot, { recursive: true });
await mkdir(artifactsRoot, { recursive: true });
await mkdir(screenshotsRoot, { recursive: true });
await mkdir(logsRoot, { recursive: true });
await mkdir(transcriptsRoot, { recursive: true });

const manifest = {
  runLabel,
  createdAt: new Date().toISOString(),
  scope:
    "M9 readiness only; this directory is prepared for the future scenario run and does not start it.",
  paths: {
    runRoot,
    workspaceRoot,
    artifactsRoot,
    screenshotsRoot,
    logsRoot,
    transcriptsRoot,
  },
  requiredEnv: {
    M9_BASE_URL: "<set before the M9 scenario run>",
    M9_AUTH_TOKEN: "<set before the M9 scenario run>",
    M9_REPOSITORY_URL:
      "<set if the scenario uses a provider-backed sample repo>",
    M9_WORKSPACE_ROOT: workspaceRoot,
    M9_ARTIFACTS_ROOT: artifactsRoot,
    M9_SCREENSHOTS_ROOT: screenshotsRoot,
    M9_LOGS_ROOT: logsRoot,
    M9_TRANSCRIPTS_ROOT: transcriptsRoot,
  },
  guardrails: [
    "Do not start the M9 scenario from this script.",
    "Keep M9 evidence inside the prepared runRoot so it stays isolated from unrelated repo churn.",
    "Use a clean shared branch and a current QA stabilization call before dispatching task 15dc096b.",
  ],
};

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
await writeFile(
  envPath,
  [
    "# Prepared by ops:m9:prepare",
    "# Fill the placeholder values before the actual M9 scenario run.",
    `export M9_BASE_URL="${process.env.M9_BASE_URL ?? "<set-me>"}"`,
    `export M9_AUTH_TOKEN="${process.env.M9_AUTH_TOKEN ?? "<set-me>"}"`,
    `export M9_REPOSITORY_URL="${process.env.M9_REPOSITORY_URL ?? "<optional-provider-repo-url>"}"`,
    `export M9_WORKSPACE_ROOT="${workspaceRoot}"`,
    `export M9_ARTIFACTS_ROOT="${artifactsRoot}"`,
    `export M9_SCREENSHOTS_ROOT="${screenshotsRoot}"`,
    `export M9_LOGS_ROOT="${logsRoot}"`,
    `export M9_TRANSCRIPTS_ROOT="${transcriptsRoot}"`,
    "",
  ].join("\n"),
  "utf8",
);

console.log(
  JSON.stringify(
    {
      ok: true,
      runLabel,
      runRoot,
      workspaceRoot,
      artifactsRoot,
      screenshotsRoot,
      logsRoot,
      transcriptsRoot,
      manifestPath,
      envPath,
    },
    null,
    2,
  ),
);
