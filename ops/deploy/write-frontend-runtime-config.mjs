import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..", "..");
const tailnetEnvPath = join(homedir(), ".config", "codex-swarm", "tailnet.env");

function loadTailnetEnv() {
  if (!existsSync(tailnetEnvPath)) {
    return {};
  }

  return Object.fromEntries(
    readFileSync(tailnetEnvPath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

const tailnetEnv = loadTailnetEnv();

function readEnv(name) {
  return process.env[name] ?? tailnetEnv[name] ?? "";
}

const apiBaseUrl =
  readEnv("CODEX_SWARM_API_BASE_URL")
  || readEnv("VITE_API_BASE_URL")
  || (readEnv("CODEX_SWARM_HOST") && readEnv("CODEX_SWARM_API_PORT")
    ? `http://${readEnv("CODEX_SWARM_HOST")}:${readEnv("CODEX_SWARM_API_PORT")}`
    : "");

const enableLegacyDevBearer =
  readEnv("AUTH_ENABLE_LEGACY_DEV_BEARER") === "true"
  || readEnv("VITE_ENABLE_LEGACY_DEV_BEARER") === "true";

const config = {
  apiBaseUrl,
  enableLegacyDevBearer,
};

if (enableLegacyDevBearer) {
  config.apiToken =
    readEnv("CODEX_SWARM_DEV_AUTH_TOKEN")
    || readEnv("CODEX_SWARM_API_TOKEN")
    || readEnv("CODEX_SWARM_AUTH_TOKEN")
    || readEnv("DEV_AUTH_TOKEN")
    || readEnv("VITE_API_TOKEN");
}

writeFileSync(
  join(repoRoot, "frontend", "dist", "runtime-config.js"),
  `window.__CODEX_SWARM_CONFIG__ = ${JSON.stringify(config, null, 2)};\n`,
);

writeFileSync(
  join(repoRoot, "frontend", "dist", "runtime-config.json"),
  `${JSON.stringify(config, null, 2)}\n`,
);
