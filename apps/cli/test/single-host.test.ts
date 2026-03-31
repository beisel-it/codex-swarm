import os from "node:os";
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
});
