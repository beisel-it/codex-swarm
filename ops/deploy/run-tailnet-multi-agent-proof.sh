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

AUTH_TOKEN="${CODEX_SWARM_SERVICE_TOKEN:-${AUTH_SERVICE_TOKEN:-${CODEX_SWARM_API_TOKEN:-${CODEX_SWARM_DEV_AUTH_TOKEN:-${DEV_AUTH_TOKEN:-}}}}}"
if [[ -z "$AUTH_TOKEN" ]]; then
  echo "Missing auth token in $ENV_FILE" >&2
  exit 1
fi

BASE_URL="${CODEX_SWARM_API_BASE_URL}"
if [[ -z "$BASE_URL" ]]; then
  echo "Missing CODEX_SWARM_API_BASE_URL in $ENV_FILE" >&2
  exit 1
fi

PROOF_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/codex-swarm-multi-agent-proof-XXXXXX")"
REPO_ROOT="${PROOF_ROOT}/repo"
mkdir -p "$REPO_ROOT"
trap 'rm -rf "$PROOF_ROOT"' EXIT

cat >"${REPO_ROOT}/README.md" <<'EOF'
# Multi-agent proof repo

This repository is used to prove the hosted codex-swarm instance can execute a real multi-agent run.
EOF

cat >"${REPO_ROOT}/landing-page.md" <<'EOF'
# Launch faster

Placeholder landing page source.
EOF

git -C "$REPO_ROOT" init --initial-branch=main >/dev/null
git -C "$REPO_ROOT" config user.name "Codex Swarm"
git -C "$REPO_ROOT" config user.email "codex-swarm@example.com"
git -C "$REPO_ROOT" add README.md landing-page.md
git -C "$REPO_ROOT" commit -m "initial proof repo" >/dev/null

api() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  if [[ -n "$body" ]]; then
    curl -sf -X "$method" "$BASE_URL$path" \
      -H "Authorization: Bearer ${AUTH_TOKEN}" \
      -H 'Content-Type: application/json' \
      --data "$body"
  else
    curl -sf -X "$method" "$BASE_URL$path" \
      -H "Authorization: Bearer ${AUTH_TOKEN}" \
      -H 'Content-Type: application/json'
  fi
}

repository_json="$(jq -n \
  --arg name "multi-agent-proof" \
  --arg url "file://${REPO_ROOT}" \
  --arg localPath "$REPO_ROOT" \
  '{name:$name, url:$url, provider:"local", localPath:$localPath, defaultBranch:"main", metadata:{source:"multi-agent-proof"}}')"
repository_id="$(api POST /api/v1/repositories "$repository_json" | jq -r '.id')"

run_json="$(jq -n \
  --arg repositoryId "$repository_id" \
  '{repositoryId:$repositoryId, goal:"Prove a hosted multi-agent codex-swarm run", concurrencyCap:4, metadata:{source:"multi-agent-proof"}}')"
run_id="$(api POST /api/v1/runs "$run_json" | jq -r '.id')"

create_task() {
  local title="$1"
  local description="$2"
  local role="$3"
  local file_path="$4"
  local expected="$5"
  local body
  body="$(jq -n \
    --arg runId "$run_id" \
    --arg title "$title" \
    --arg description "$description" \
    --arg role "$role" \
    --arg filePath "$file_path" \
    --arg expected "$expected" \
    '{
      runId:$runId,
      title:$title,
      description:$description,
      role:$role,
      priority:1,
      dependencyIds:[],
      acceptanceCriteria:[
        ("Create or update " + $filePath),
        ("Ensure the file contains: " + $expected)
      ],
      validationTemplates:[
        {
          name:"content-check",
          command:("grep -Fqx " + ($expected|@sh) + " " + ($filePath|@sh)),
          summary:"Check the exact expected line exists",
          artifactPath:("artifacts/validations/" + ($filePath | gsub("[^A-Za-z0-9._-]"; "_")) + ".json")
        }
      ]
    }')"
  api POST /api/v1/tasks "$body" >/dev/null
}

create_task "Hero copy" "Write the exact approved hero line into copy/hero.txt and nothing else is required." "frontend-developer" "copy/hero.txt" "Launch faster with a codex-swarm operator cockpit."
create_task "Feature bullets" "Write the exact approved feature bullets line into copy/features.txt." "frontend-developer" "copy/features.txt" "Live board, real worker fleet, reviewable transcripts, and validation-backed runs."
create_task "CTA copy" "Write the exact approved CTA line into copy/cta.txt." "frontend-developer" "copy/cta.txt" "Start a run, watch agents execute, and review the output in one place."
create_task "Ops note" "Write the exact approved ops note into ops/deployment.txt." "infrastructure-engineer" "ops/deployment.txt" "Tailnet-only API and frontend; database and Redis remain loopback-only."

api POST "/api/v1/runs/${run_id}/start" '{}' >/dev/null

echo "repository=${repository_id}"
echo "run=${run_id}"
echo "proof_repo=${REPO_ROOT}"

deadline=$((SECONDS + 600))
while (( SECONDS < deadline )); do
  run_json="$(api GET "/api/v1/runs/${run_id}")"
  run_status="$(jq -r '.status' <<<"$run_json")"
  assignment_states="$(api GET "/api/v1/worker-dispatch-assignments?runId=${run_id}" | jq -r 'map(.state) | join(",")')"
  printf 'run=%s assignments=%s\n' "$run_status" "$assignment_states"

  if [[ "$run_status" == "completed" ]]; then
    echo
    echo "worker nodes:"
    api GET /api/v1/worker-nodes | jq -r '.[] | [.name,.status,.metadata.activeClaims,.metadata.queueDepth,.metadata.sessionCount] | @tsv'
    echo
    echo "run detail:"
    api GET "/api/v1/runs/${run_id}" | jq '{id,status,tasks:[.tasks[]|{id,title,status,ownerAgentId}],agents:[.agents[]|{id,name,role,status,currentTaskId,workerNodeId}],sessions:[.sessions[]|{id,agentId,state,workerNodeId,threadId}]}'
    exit 0
  fi

  if [[ "$run_status" == "failed" || "$run_status" == "cancelled" ]]; then
    echo "run entered terminal failure state: $run_status" >&2
    api GET "/api/v1/runs/${run_id}" | jq >&2
    exit 1
  fi

  sleep 5
done

echo "timed out waiting for run completion" >&2
api GET "/api/v1/runs/${run_id}" | jq >&2
api GET "/api/v1/worker-dispatch-assignments?runId=${run_id}" | jq >&2
exit 1
