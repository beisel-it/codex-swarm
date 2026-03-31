#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" != "--run" ]]; then
  cat <<'EOF'
Codex Swarm single-host installer

This script is intentionally not a blind curl|sh entrypoint.
Review it first, then rerun with:

  ./ops/deploy/install-single-host.sh --run [extra args]

The script delegates to:

  codex-swarm install

Typical usage:

  npm install -g codex-swarm
  ./ops/deploy/install-single-host.sh --run --version latest --dry-run
EOF
  exit 0
fi

shift

if ! command -v codex-swarm >/dev/null 2>&1; then
  echo "Missing codex-swarm in PATH. Install the CLI first." >&2
  echo "Example: npm install -g codex-swarm" >&2
  exit 1
fi

exec codex-swarm install "$@"
