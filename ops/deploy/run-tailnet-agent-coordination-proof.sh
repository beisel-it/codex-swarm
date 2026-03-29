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

exec corepack pnpm exec tsx ./ops/deploy/run-tailnet-agent-coordination-proof.ts
