#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${CODEX_SWARM_TAILNET_ENV_FILE:-$HOME/.config/codex-swarm/tailnet.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing tailnet env file: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

export CODEX_SWARM_API_BASE_URL="${CODEX_SWARM_API_BASE_URL:-http://${CODEX_SWARM_TAILNET_DNS}:${CODEX_SWARM_API_PORT}}"
export CODEX_SWARM_API_TOKEN="${CODEX_SWARM_API_TOKEN:-$CODEX_SWARM_DEV_AUTH_TOKEN}"

echo "Launching codex-swarm TUI against ${CODEX_SWARM_API_BASE_URL}" >&2
exec corepack pnpm tui
