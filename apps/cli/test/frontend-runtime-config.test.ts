import os from "node:os";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

async function runRuntimeConfigWriter(env: Record<string, string | undefined>) {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "codex-swarm-runtime-config-"));
  const homeDir = path.join(fixtureRoot, "home");
  const scriptSource = path.resolve(
    import.meta.dirname,
    "..",
    "..",
    "..",
    "ops",
    "deploy",
    "write-frontend-runtime-config.mjs"
  );
  const scriptTarget = path.join(fixtureRoot, "ops", "deploy", "write-frontend-runtime-config.mjs");
  const runtimeConfigPath = path.join(fixtureRoot, "frontend", "dist", "runtime-config.json");
  const runtimeConfigJsPath = path.join(fixtureRoot, "frontend", "dist", "runtime-config.js");

  await mkdir(path.dirname(scriptTarget), { recursive: true });
  await mkdir(path.join(fixtureRoot, "frontend", "dist"), { recursive: true });
  await mkdir(homeDir, { recursive: true });
  await writeFile(scriptTarget, await readFile(scriptSource, "utf8"), "utf8");

  const result = spawnSync(process.execPath, [scriptTarget], {
    cwd: fixtureRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: homeDir,
      ...env,
    },
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `runtime config writer failed with exit code ${result.status ?? 1}`);
  }

  return {
    json: JSON.parse(await readFile(runtimeConfigPath, "utf8")) as {
      apiBaseUrl?: string;
      apiToken?: string;
      enableLegacyDevBearer?: boolean;
    },
    js: await readFile(runtimeConfigJsPath, "utf8"),
  };
}

describe("frontend runtime config writer", () => {
  it("omits bearer-token material when legacy dev bearer auth is disabled", async () => {
    const config = await runRuntimeConfigWriter({
      CODEX_SWARM_API_BASE_URL: "https://api.example.test",
      AUTH_ENABLE_LEGACY_DEV_BEARER: "false",
      VITE_API_TOKEN: "release-token-should-not-ship",
    });

    expect(config.json).toEqual({
      apiBaseUrl: "https://api.example.test",
      enableLegacyDevBearer: false,
    });
    expect(config.js).not.toContain("release-token-should-not-ship");
    expect(config.js).not.toContain("\"apiToken\"");
  });

  it("keeps the legacy bearer token only when the explicit fallback is enabled", async () => {
    const config = await runRuntimeConfigWriter({
      CODEX_SWARM_API_BASE_URL: "https://api.example.test",
      AUTH_ENABLE_LEGACY_DEV_BEARER: "true",
      VITE_API_TOKEN: "dev-only-token",
    });

    expect(config.json).toEqual({
      apiBaseUrl: "https://api.example.test",
      apiToken: "dev-only-token",
      enableLegacyDevBearer: true,
    });
    expect(config.js).toContain("dev-only-token");
  });
});
