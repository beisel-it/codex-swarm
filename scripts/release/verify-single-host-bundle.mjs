#!/usr/bin/env node

import { spawn } from "node:child_process";
import readline from "node:readline";

const bundlePath = process.argv[2];

if (!bundlePath) {
  throw new Error(
    "Usage: node scripts/release/verify-single-host-bundle.mjs <bundle-path>",
  );
}

const forbiddenPatterns = [
  "/test/",
  ".test.js",
  ".test.d.ts",
  ".spec.js",
  ".spec.d.ts",
  "/.vite/",
  "/node_modules/.bin/",
  "/node_modules/vitest",
  "/apps/worker/",
  "/packages/contracts/",
  "/packages/orchestration/",
  "/packages/database/",
];

const requiredEntries = new Set([
  "/codex-swarm-release.json",
  "/apps/api/dist/src/server.js",
  "/apps/api/dist/src/ops/local-worker-daemon.js",
  "/apps/tui/dist/index.js",
  "/apps/tui/dist/data.js",
  "/apps/tui/dist/mock-data.js",
  "/apps/tui/dist/view-model.js",
  "/frontend/dist/index.html",
  "/node_modules/@codex-swarm/worker/index.js",
  "/node_modules/@codex-swarm/contracts/index.js",
  "/node_modules/@codex-swarm/orchestration/index.js",
  "/node_modules/@codex-swarm/database/index.js",
]);

await new Promise((resolve, reject) => {
  const child = spawn("tar", ["-tzf", bundlePath], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  const lines = readline.createInterface({ input: child.stdout });

  lines.on("line", (entry) => {
    for (const pattern of forbiddenPatterns) {
      if (entry.includes(pattern)) {
        child.kill("SIGTERM");
        reject(
          new Error(
            `Bundle contains forbidden path pattern: ${pattern} (${entry})`,
          ),
        );
        return;
      }
    }

    for (const suffix of requiredEntries) {
      if (entry.endsWith(suffix)) {
        requiredEntries.delete(suffix);
      }
    }
  });

  child.on("error", reject);
  child.on("exit", (code, signal) => {
    if (signal && signal !== "SIGTERM") {
      reject(
        new Error(`tar -tzf ${bundlePath} terminated with signal ${signal}`),
      );
      return;
    }

    if ((code ?? 1) !== 0 && code !== null) {
      reject(new Error(`tar -tzf ${bundlePath} failed with exit code ${code}`));
      return;
    }

    if (requiredEntries.size > 0) {
      reject(
        new Error(
          `Bundle is missing required entries: ${Array.from(requiredEntries).join(", ")}`,
        ),
      );
      return;
    }

    resolve();
  });
});

console.log(`Bundle verification passed for ${bundlePath}`);
