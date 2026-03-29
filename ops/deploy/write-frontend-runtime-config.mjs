import { writeFileSync } from "node:fs";

const config = {
  apiBaseUrl: process.env.CODEX_SWARM_API_BASE_URL ?? process.env.VITE_API_BASE_URL ?? "",
  apiToken: process.env.CODEX_SWARM_DEV_AUTH_TOKEN ?? process.env.VITE_API_TOKEN ?? "",
};

writeFileSync(
  "frontend/dist/runtime-config.js",
  `window.__CODEX_SWARM_CONFIG__ = ${JSON.stringify(config, null, 2)};\n`,
);

writeFileSync(
  "frontend/dist/runtime-config.json",
  `${JSON.stringify(config, null, 2)}\n`,
);
