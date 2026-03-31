# Single-Host Install

## Support boundary

This is the supported release-1 deployment shape:

- private self-hosted
- one host running API, frontend, and at least one worker
- local Postgres and Redis on the same host
- optional same-host worker fan-out through `codex-swarm-worker@.service`

This document does **not** describe a public-browser deployment or generalized
remote-worker onboarding.

## Prerequisites

Install and verify:

- Node 22+
- pnpm via Corepack
- `curl`
- Docker
- `git`
- `codex`
- `systemctl --user`

Optional but recommended:

- `loginctl enable-linger <user>` so user services survive logout

## One-command install

The primary release install path is the review-first remote installer:

```bash
curl -fsSL https://raw.githubusercontent.com/beisel-it/codex-swarm/main/ops/deploy/install-single-host-remote.sh | sh
```

By default it:

- resolves the latest published GitHub Release bundle
- shows the exact bundle URL and delegated install command
- asks whether you want to continue after review
- asks again before it performs a real install

For trusted automation or a fully non-interactive local install:

```bash
curl -fsSL https://raw.githubusercontent.com/beisel-it/codex-swarm/main/ops/deploy/install-single-host-remote.sh | sh -s -- --yes --start
```

## Install the CLI

```bash
npm install -g codex-swarm
```

The installed command is:

```bash
codex-swarm
```

## Review the installer entrypoint

If you want a checked-in local shell entrypoint instead of the remote one-liner, inspect the wrapper first:

```bash
./ops/deploy/install-single-host.sh
```

It intentionally does not execute immediately. After review, rerun it with
`--run`, or call the CLI directly.

## Dry-run the installer

Using the latest published release bundle:

```bash
codex-swarm install --version latest --dry-run
```

This validates prerequisites, resolves the GitHub Release bundle, shows the env
and systemd paths, and prints the commands it would run without mutating the
host.

## Install the single-host stack

Write the env file and user units:

```bash
codex-swarm install --version latest
```

This writes:

- `~/.config/codex-swarm/single-host.env`
- `~/.config/systemd/user/codex-swarm-*.service`
- `~/.config/systemd/user/codex-swarm.target`

The generated env template already expands `__HOME__` to the current user's
home directory for artifact, workspace, Postgres, and Redis storage paths.

Edit `~/.config/codex-swarm/single-host.env` before starting services.

Important values:

- `CODEX_SWARM_DB_PASSWORD`
- `CODEX_SWARM_DEV_AUTH_TOKEN`
- `CODEX_SWARM_ARTIFACT_STORAGE_ROOT`
- `CODEX_SWARM_WORKSPACE_ROOT`
- `CODEX_SWARM_CODEX_COMMAND`

## Build and start

Once the env file contains real values:

```bash
codex-swarm install --install-root ~/.local/share/codex-swarm/install --start --yes
```

This:

- extracts the release bundle into the install root
- reloads systemd user units
- enables `codex-swarm.target`
- restarts the stack

## Validate

Run:

```bash
codex-swarm doctor --install-root ~/.local/share/codex-swarm/install
```

Then confirm:

- `systemctl --user status codex-swarm.target`
- `curl http://127.0.0.1:4300/health`
- browser UI reachable on `http://127.0.0.1:4300`

## Optional same-host worker fan-out

After the base worker is healthy, you can still use the existing helper to add
same-host worker instances. The canonical base worker path remains the built
`local-worker-daemon`; `pnpm dev:worker` is a development-only path and not part
of the release install contract.

```bash
corepack pnpm ops:tailnet:workers:bootstrap 4
```

Treat that as an advanced local-capacity workflow, not the default install
path.
