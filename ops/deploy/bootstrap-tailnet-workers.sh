#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${CODEX_SWARM_TAILNET_ENV_FILE:-$HOME/.config/codex-swarm/tailnet.env}"
WORKER_COUNT="${1:-4}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing tailnet env file: $ENV_FILE" >&2
  exit 1
fi

if ! [[ "$WORKER_COUNT" =~ ^[0-9]+$ ]] || [[ "$WORKER_COUNT" -lt 1 ]]; then
  echo "Worker count must be a positive integer" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [[ -z "${CODEX_SWARM_WORKSPACE_ROOT:-}" ]]; then
  echo "CODEX_SWARM_WORKSPACE_ROOT is required in $ENV_FILE" >&2
  exit 1
fi

WORKER_ENV_DIR="${HOME}/.config/codex-swarm/workers"
mkdir -p "$WORKER_ENV_DIR"

worker_uuid() {
  local index="$1"
  printf '00000000-0000-4000-8000-%012d' "$index"
}

if [[ "$WORKER_COUNT" -lt 1 ]]; then
  echo "Worker count must be at least 1" >&2
  exit 1
fi

for index in $(seq 2 "$WORKER_COUNT"); do
  worker_name="worker-${index}"
  worker_env="${WORKER_ENV_DIR}/${worker_name}.env"
  worker_workspace="${CODEX_SWARM_WORKSPACE_ROOT%/}/nodes/${worker_name}"

  cat >"$worker_env" <<EOF
CODEX_SWARM_NODE_ID=$(worker_uuid "$index")
CODEX_SWARM_NODE_NAME=local-${worker_name}
CODEX_SWARM_WORKSPACE_ROOT=${worker_workspace}
CODEX_SWARM_CAPABILITIES=local,workspace-write
EOF

  mkdir -p "$worker_workspace"
  echo "wrote ${worker_env}"
done

systemctl --user daemon-reload

for index in $(seq 2 "$WORKER_COUNT"); do
  worker_name="worker-${index}"
  systemctl --user enable --now "codex-swarm-worker@${worker_name}.service"
done

echo
echo "primary worker remains codex-swarm-worker.service (worker-1)"
echo
echo "active worker services:"
systemctl --user --no-pager --full --plain list-units 'codex-swarm-worker*.service'
