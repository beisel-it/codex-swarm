#!/bin/sh
set -eu

GITHUB_REPO="beisel-it/codex-swarm"
RELEASE_BUNDLE_ASSET_PREFIX="codex-swarm-single-host"
INSTALLER_DEFAULT_VERSION="latest"
INSTALLER_URL="https://raw.githubusercontent.com/${GITHUB_REPO}/main/ops/deploy/install-single-host-remote.sh"

VERSION="$INSTALLER_DEFAULT_VERSION"
YES=0
DRY_RUN=0
PASSTHROUGH_ARGS=""

append_arg() {
  if [ -z "$PASSTHROUGH_ARGS" ]; then
    PASSTHROUGH_ARGS=$(printf "%s" "$1")
    return
  fi

  PASSTHROUGH_ARGS=$(printf "%s\n%s" "$PASSTHROUGH_ARGS" "$1")
}

usage() {
  cat <<EOF
Codex Swarm remote single-host installer

Usage:
  curl -fsSL ${INSTALLER_URL} | sh
  curl -fsSL ${INSTALLER_URL} | sh -s -- --yes --start

Flags:
  --version <version|latest>
  --install-root <path>
  --env-file <path>
  --dry-run
  --start
  --yes
  --help

Behavior:
  - resolves a published GitHub Release bundle
  - downloads the bundle to a temporary directory
  - runs the bundled codex-swarm CLI installer against that bundle
  - defaults to review-first prompts unless --yes is passed
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --version)
      [ "$#" -ge 2 ] || {
        echo "--version requires a value" >&2
        exit 1
      }
      VERSION="$2"
      append_arg "$1"
      append_arg "$2"
      shift 2
      ;;
    --yes)
      YES=1
      append_arg "$1"
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      append_arg "$1"
      shift
      ;;
    --install-root|--env-file)
      [ "$#" -ge 2 ] || {
        echo "$1 requires a value" >&2
        exit 1
      }
      append_arg "$1"
      append_arg "$2"
      shift 2
      ;;
    --start)
      append_arg "$1"
      shift
      ;;
    --help|help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

confirm() {
  prompt="$1"
  printf "%s" "$prompt" >&2
  IFS= read -r reply || reply=""
  case "$reply" in
    y|Y|yes|YES)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

require_command curl
require_command tar
require_command node
require_command mktemp

API_URL="https://api.github.com/repos/${GITHUB_REPO}/releases/latest"
if [ "$VERSION" != "latest" ]; then
  API_URL="https://api.github.com/repos/${GITHUB_REPO}/releases/tags/codex-swarm@${VERSION}"
fi

RELEASE_JSON=$(curl -fsSL \
  -H "Accept: application/vnd.github+json" \
  -H "User-Agent: codex-swarm-installer" \
  "$API_URL")

ASSET_URL=$(printf "%s" "$RELEASE_JSON" | node -e '
const prefix = process.argv[1];
const release = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
const asset = (release.assets || []).find((candidate) =>
  candidate.name.startsWith(prefix) && candidate.name.endsWith(".tar.gz")
);
if (!asset) {
  console.error(`No ${prefix} bundle asset found on release ${release.tag_name}`);
  process.exit(1);
}
process.stdout.write(asset.browser_download_url);
' "$RELEASE_BUNDLE_ASSET_PREFIX")

RELEASE_TAG=$(printf "%s" "$RELEASE_JSON" | node -e '
const release = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
process.stdout.write(release.tag_name);
')

if [ "$YES" -ne 1 ]; then
  cat <<EOF
Codex Swarm one-command installer

This script is review-first by default.

Resolved release:
  ${RELEASE_TAG}

Bundle URL:
  ${ASSET_URL}

Installer source:
  ${INSTALLER_URL}

Delegated command:
  node <bundled-cli> install --bundle <downloaded-bundle> [your flags]

Pass --yes to skip prompts.
EOF

  if ! confirm "Continue after review? [y/N] "; then
    echo "Installation cancelled." >&2
    exit 0
  fi
fi

TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/codex-swarm-installer.XXXXXX")
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT INT TERM

BUNDLE_PATH="${TMP_DIR}/bundle.tar.gz"
EXTRACT_DIR="${TMP_DIR}/extracted"

mkdir -p "$EXTRACT_DIR"
curl -fsSL "$ASSET_URL" -o "$BUNDLE_PATH"
tar -xzf "$BUNDLE_PATH" -C "$EXTRACT_DIR"

BUNDLE_ROOT=$(find "$EXTRACT_DIR" -mindepth 1 -maxdepth 1 -type d | head -n 1)

if [ -z "${BUNDLE_ROOT:-}" ]; then
  echo "Failed to locate extracted release bundle root." >&2
  exit 1
fi

BUNDLED_CLI="${BUNDLE_ROOT}/apps/cli/dist/bin/codex-swarm.js"

if [ ! -r "$BUNDLED_CLI" ]; then
  echo "Bundled CLI not found at ${BUNDLED_CLI}" >&2
  exit 1
fi

if [ "$YES" -ne 1 ] && [ "$DRY_RUN" -ne 1 ]; then
  if ! confirm "Install Codex Swarm now? [y/N] "; then
    echo "Installation cancelled." >&2
    exit 0
  fi
fi

set -- node "$BUNDLED_CLI" install --bundle "$BUNDLE_PATH" --yes
if [ -n "$PASSTHROUGH_ARGS" ]; then
  OLD_IFS=$IFS
  IFS='
'
  for arg in $PASSTHROUGH_ARGS; do
    set -- "$@" "$arg"
  done
  IFS=$OLD_IFS
fi

if "$@"; then
  status=0
else
  status=$?
fi

exit "$status"
