import { spawn } from "node:child_process";

const usingLiveApi = Boolean(process.env.CODEX_SWARM_API_BASE_URL?.trim());

function printFailureGuidance(code) {
  const lines = [
    "codex-swarm TUI failed to launch.",
    "Checks:",
    "- run `corepack pnpm install` to ensure workspace dependencies are present",
    "- use Node 22+ and pnpm 10.28+ as declared in the workspace root",
    "- set CODEX_SWARM_API_BASE_URL and CODEX_SWARM_API_TOKEN for live API mode",
    "- without CODEX_SWARM_API_BASE_URL the TUI should still start in mock fallback mode",
  ];

  if (typeof code === "number") {
    lines.push(`- launcher exited with status ${code}`);
  }

  console.error(lines.join("\n"));
}

const child = spawn("corepack", ["pnpm", "--dir", "apps/tui", "start"], {
  cwd: process.cwd(),
  stdio: "inherit",
  env: process.env,
});

child.on("error", (error) => {
  printFailureGuidance();
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  if ((code ?? 0) !== 0) {
    printFailureGuidance(code ?? undefined);
  } else if (!usingLiveApi) {
    console.error("codex-swarm TUI exited from mock fallback mode.");
  }

  process.exit(code ?? 0);
});
