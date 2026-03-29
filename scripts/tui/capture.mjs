import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";

const captureRoot = resolve(process.env.TUI_CAPTURE_ROOT ?? ".ops/tui-captures");
const label = process.env.TUI_CAPTURE_LABEL ?? new Date().toISOString().replace(/[:.]/g, "-");
const captureDir = join(captureRoot, label);
const transcriptPath = join(captureDir, "session.typescript");
const metadataPath = join(captureDir, "metadata.json");
const captureSeconds = Number.parseInt(process.env.TUI_CAPTURE_SECONDS ?? "8", 10);
const columns = Number.parseInt(process.env.TUI_CAPTURE_COLUMNS ?? "140", 10);
const rows = Number.parseInt(process.env.TUI_CAPTURE_ROWS ?? "40", 10);
const command = `sh -lc 'stty cols ${columns} rows ${rows} && node ./scripts/tui/start.mjs'`;
const startedAt = new Date().toISOString();

if (!Number.isFinite(captureSeconds) || captureSeconds < 1) {
  console.error("TUI_CAPTURE_SECONDS must be an integer >= 1.");
  process.exit(1);
}

if (!Number.isFinite(columns) || columns < 80 || !Number.isFinite(rows) || rows < 24) {
  console.error("TUI_CAPTURE_COLUMNS must be >= 80 and TUI_CAPTURE_ROWS must be >= 24.");
  process.exit(1);
}

await mkdir(captureDir, { recursive: true });

const child = spawn("script", ["-q", "-e", "-c", command, transcriptPath], {
  cwd: process.cwd(),
  stdio: "inherit",
  env: process.env,
});

const timeoutId = setTimeout(() => {
  child.kill("SIGINT");
}, captureSeconds * 1000);

const exitCode = await new Promise((resolveExit) => {
  child.on("error", () => resolveExit(1));
  child.on("exit", (code) => resolveExit(code ?? 0));
});

clearTimeout(timeoutId);

const metadata = {
  label,
  startedAt,
  endedAt: new Date().toISOString(),
  captureSeconds,
  terminalSize: { columns, rows },
  command,
  transcriptPath,
  mode: process.env.CODEX_SWARM_API_BASE_URL ? "api" : "mock",
  envHints: {
    CODEX_SWARM_API_BASE_URL: process.env.CODEX_SWARM_API_BASE_URL ?? null,
    CODEX_SWARM_API_TOKEN: process.env.CODEX_SWARM_API_TOKEN ? "<redacted>" : null,
  },
};

await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      ok: exitCode === 0,
      label,
      captureDir,
      transcriptPath,
      metadataPath,
      nextStep:
        "Use `script -q -e -c \"corepack pnpm tui\" <path>` for a longer interactive capture and save screenshots in the same directory.",
    },
    null,
    2,
  ),
);

process.exit(exitCode);
