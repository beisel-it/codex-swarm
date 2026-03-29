import { writeFileSync } from "node:fs";

const config = {
  apiBaseUrl: process.env.CODEX_SWARM_API_BASE_URL ?? "",
  apiToken: process.env.CODEX_SWARM_DEV_AUTH_TOKEN ?? "",
};

writeFileSync(
  "frontend/dist/runtime-config.js",
  `window.__CODEX_SWARM_CONFIG__ = ${JSON.stringify(config, null, 2)};\n`,
);
