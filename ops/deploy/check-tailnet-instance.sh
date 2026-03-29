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

echo "tailnet env: $ENV_FILE"
echo "api:      http://${CODEX_SWARM_TAILNET_DNS}:${CODEX_SWARM_API_PORT}"
echo "frontend: http://${CODEX_SWARM_TAILNET_DNS}:${CODEX_SWARM_FRONTEND_PORT}"
echo

systemctl --user --no-pager --full status \
  codex-swarm-postgres.service \
  codex-swarm-redis.service \
  codex-swarm-api.service \
  codex-swarm-frontend.service \
  codex-swarm-worker.service || true

echo
echo "worker services:"
systemctl --user --no-pager --full --plain list-units 'codex-swarm-worker*.service' || true

echo
echo "listeners:"
ss -lnt | grep -E ":((${CODEX_SWARM_API_PORT})|(${CODEX_SWARM_FRONTEND_PORT})|(${CODEX_SWARM_POSTGRES_PORT})|(${CODEX_SWARM_REDIS_PORT}))\\b" || true

echo
echo "health:"
curl -fsS "http://${CODEX_SWARM_TAILNET_DNS}:${CODEX_SWARM_API_PORT}/health"
echo

echo
echo "worker nodes:"
curl -fsS "http://${CODEX_SWARM_TAILNET_DNS}:${CODEX_SWARM_API_PORT}/api/v1/worker-nodes" \
  -H "Authorization: Bearer ${CODEX_SWARM_API_TOKEN:-${CODEX_SWARM_DEV_AUTH_TOKEN}}" || true
echo

echo "recent worker logs:"
journalctl --user -u 'codex-swarm-worker*.service' -n 40 --no-pager || true

echo
echo "worker dispatch assignments:"
curl -fsS "http://${CODEX_SWARM_TAILNET_DNS}:${CODEX_SWARM_API_PORT}/api/v1/worker-dispatch-assignments" \
  -H "Authorization: Bearer ${CODEX_SWARM_API_TOKEN:-${CODEX_SWARM_DEV_AUTH_TOKEN}}" || true
echo
