import os from "node:os";

export const RELEASE_METADATA_FILE = "codex-swarm-release.json";
export const RELEASE_BUNDLE_ASSET_PREFIX = "codex-swarm-single-host";

export const SINGLE_HOST_UNIT_NAMES = [
  "codex-swarm-postgres.service",
  "codex-swarm-redis.service",
  "codex-swarm-api.service",
  "codex-swarm-worker.service",
  "codex-swarm-worker@.service",
  "codex-swarm.target",
] as const;

export function renderSingleHostEnvTemplate(
  template: string,
  options?: { homeDir?: string },
) {
  const homeDir = options?.homeDir ?? os.homedir();
  return template.replaceAll("__HOME__", homeDir);
}

export function renderSystemdUnitTemplate(
  template: string,
  options: { installRoot: string; envFile: string },
) {
  return template
    .replaceAll("__INSTALL_ROOT__", options.installRoot)
    .replaceAll("__ENV_FILE__", options.envFile);
}

export function envContainsInstallPlaceholders(envText: string) {
  return envText.includes("change-me") || envText.includes("__HOME__");
}

export function parseEnvAssignments(envText: string) {
  return Object.fromEntries(
    envText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

export function getSingleHostDataDirs(envText: string) {
  const values = parseEnvAssignments(envText);
  return [
    values.CODEX_SWARM_ARTIFACT_STORAGE_ROOT,
    values.CODEX_SWARM_WORKSPACE_ROOT,
    `${os.homedir()}/.local/share/codex-swarm/postgres`,
    `${os.homedir()}/.local/share/codex-swarm/redis`,
  ].filter((value): value is string => Boolean(value));
}

export function defaultInstallRoot() {
  return `${os.homedir()}/.local/share/codex-swarm/install`;
}
