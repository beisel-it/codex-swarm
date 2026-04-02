import os from "node:os";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  envContainsInstallPlaceholders,
  getSingleHostDataDirs,
  renderSingleHostEnvTemplate,
  renderSystemdUnitTemplate,
  SINGLE_HOST_UNIT_NAMES
} from "../src/lib/single-host.js";

describe("single-host installer assets", () => {
  it("renders home-relative env defaults", () => {
    const rendered = renderSingleHostEnvTemplate(
      "CODEX_SWARM_ARTIFACT_STORAGE_ROOT=__HOME__/.local/share/codex-swarm/artifacts\n",
      { homeDir: "/tmp/codex-home" }
    );

    expect(rendered).toContain("/tmp/codex-home/.local/share/codex-swarm/artifacts");
    expect(rendered).not.toContain("__HOME__");
  });

  it("renders systemd templates with explicit install paths", () => {
    const rendered = renderSystemdUnitTemplate(
      "WorkingDirectory=__INSTALL_ROOT__\nEnvironmentFile=__ENV_FILE__\n",
      {
        installRoot: "/srv/codex-swarm",
        envFile: "/home/test/.config/codex-swarm/single-host.env"
      }
    );

    expect(rendered).toContain("WorkingDirectory=/srv/codex-swarm");
    expect(rendered).toContain("EnvironmentFile=/home/test/.config/codex-swarm/single-host.env");
  });

  it("detects placeholder values before service start", () => {
    expect(envContainsInstallPlaceholders("CODEX_SWARM_DB_PASSWORD=change-me\n")).toBe(true);
    expect(envContainsInstallPlaceholders("CODEX_SWARM_WORKSPACE_ROOT=__HOME__/workspaces\n")).toBe(true);
    expect(envContainsInstallPlaceholders("CODEX_SWARM_DB_PASSWORD=ready\n")).toBe(false);
  });

  it("collects required single-host data directories", () => {
    const dirs = getSingleHostDataDirs(
      [
        "CODEX_SWARM_ARTIFACT_STORAGE_ROOT=/srv/codex/artifacts",
        "CODEX_SWARM_WORKSPACE_ROOT=/srv/codex/workspaces"
      ].join("\n")
    );

    expect(dirs).toContain("/srv/codex/artifacts");
    expect(dirs).toContain("/srv/codex/workspaces");
    expect(dirs).toContain(`${os.homedir()}/.local/share/codex-swarm/postgres`);
    expect(dirs).toContain(`${os.homedir()}/.local/share/codex-swarm/redis`);
  });

  it("ships the expected unit set", () => {
    expect(SINGLE_HOST_UNIT_NAMES).toEqual([
      "codex-swarm-postgres.service",
      "codex-swarm-redis.service",
      "codex-swarm-api.service",
      "codex-swarm-worker.service",
      "codex-swarm-worker@.service",
      "codex-swarm.target"
    ]);
  });

  it("wires release service credentials through the shipped worker startup assets", async () => {
    const templateRoot = path.resolve(import.meta.dirname, "..", "templates");
    const envTemplate = await readFile(path.join(templateRoot, "single-host.env.example"), "utf8");
    const workerTemplate = await readFile(path.join(templateRoot, "systemd-user", "codex-swarm-worker.service"), "utf8");
    const workerTemplateScaled = await readFile(path.join(templateRoot, "systemd-user", "codex-swarm-worker@.service"), "utf8");

    expect(envTemplate).toContain("AUTH_SERVICE_TOKEN=change-me-service-token");
    expect(envTemplate).toContain("CODEX_SWARM_SERVICE_TOKEN=change-me-service-token");
    expect(envTemplate).toContain("CODEX_SWARM_SERVICE_NAME=local-daemon");
    expect(workerTemplate).toContain('CODEX_SWARM_SERVICE_TOKEN="${CODEX_SWARM_SERVICE_TOKEN:-${AUTH_SERVICE_TOKEN:');
    expect(workerTemplate).toContain('CODEX_SWARM_SERVICE_NAME="${CODEX_SWARM_SERVICE_NAME:-local-daemon}"');
    expect(workerTemplate).not.toContain("CODEX_SWARM_API_TOKEN");
    expect(workerTemplateScaled).toContain('CODEX_SWARM_SERVICE_TOKEN="${CODEX_SWARM_SERVICE_TOKEN:-${AUTH_SERVICE_TOKEN:');
    expect(workerTemplateScaled).toContain('CODEX_SWARM_SERVICE_NAME="${CODEX_SWARM_SERVICE_NAME:-local-daemon}"');
    expect(workerTemplateScaled).not.toContain("CODEX_SWARM_API_TOKEN");
  });

  it("does not inject a legacy bearer token into the shipped api service runtime-config step", async () => {
    const templateRoot = path.resolve(import.meta.dirname, "..", "templates");
    const apiTemplate = await readFile(path.join(templateRoot, "systemd-user", "codex-swarm-api.service"), "utf8");

    expect(apiTemplate).toContain("write-frontend-runtime-config.mjs");
    expect(apiTemplate).not.toContain("VITE_API_TOKEN");
  });
});
