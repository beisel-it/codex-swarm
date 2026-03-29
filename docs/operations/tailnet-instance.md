# Tailnet-Only Hosted Instance

This deployment shape is for running codex-swarm on a host while keeping every
runtime surface off the public internet.

## Exposure model

- API binds only to the machine's Tailscale IPv4 address
- frontend binds only to the machine's Tailscale IPv4 address
- Postgres binds only to `127.0.0.1`
- Redis binds only to `127.0.0.1`

This means:

- tailnet devices can reach the app
- public interfaces do not expose the app, database, or cache

## Installed user services

- `codex-swarm-postgres.service`
- `codex-swarm-redis.service`
- `codex-swarm-api.service`
- `codex-swarm-frontend.service`
- `codex-swarm-worker.service`
- `codex-swarm.target`

The source templates live under `ops/systemd-user/`.

## Required env file

Install `%h/.config/codex-swarm/tailnet.env` from
`ops/deploy/tailnet-instance.env.example` and set:

- tailnet IP and DNS name
- API and frontend ports
- loopback-only Postgres and Redis ports
- DB password
- auth token
- absolute artifact and workspace root paths
- worker node identity and Codex command

## Access shape

Example:

- frontend: `http://<tailnet-dns>:4310`
- API: `http://<tailnet-dns>:4300`
- TUI against the hosted API: `corepack pnpm ops:tailnet:tui`

For the current host-local installation, the env file lives at:

- `~/.config/codex-swarm/tailnet.env`

## Safety requirement

Do not publish the database or Redis containers on `0.0.0.0`.

Use only:

- `127.0.0.1:<host-port>:5432` for Postgres
- `127.0.0.1:<host-port>:6379` for Redis

## Operational note

This hosted instance makes the control plane and operator surface available on
the tailnet. The next development iteration should be driven against codex-swarm
itself rather than clawteam, using the deployed API/frontend/TUI surfaces and
the checked-in operator workflows and the local worker daemon.

## Local operator commands

Check the instance:

```bash
corepack pnpm ops:tailnet:status
```

Open the codex-swarm TUI against the hosted API:

```bash
corepack pnpm ops:tailnet:tui
```

The helper reads `~/.config/codex-swarm/tailnet.env`, exports
`CODEX_SWARM_API_BASE_URL` and `CODEX_SWARM_API_TOKEN`, then launches the
repo-level TUI entrypoint in live mode.

## Autostart model

The hosted instance runs as enabled `systemd --user` services:

- `codex-swarm-postgres.service`
- `codex-swarm-redis.service`
- `codex-swarm-api.service`
- `codex-swarm-frontend.service`
- `codex-swarm-worker.service`
- optional `codex-swarm-worker@.service` instances for local multi-worker execution on the same host

With user lingering enabled, these services restart automatically on boot
without exposing the database or cache beyond loopback.

## Local worker daemon

The local host should also run:

- `codex-swarm-worker.service`

If you want the hosted instance to execute several tasks in parallel on the same
machine, use the checked-in worker template:

- `codex-swarm-worker@.service`

Bootstrap four local worker instances with:

```bash
corepack pnpm ops:tailnet:workers:bootstrap 4
```

This extends the existing primary worker service and writes per-worker env
overrides for workers `2..N` under:

- `~/.config/codex-swarm/workers/worker-2.env`
- `~/.config/codex-swarm/workers/worker-3.env`
- `~/.config/codex-swarm/workers/worker-4.env`

Each worker gets:

- its own `CODEX_SWARM_NODE_ID`
- its own `CODEX_SWARM_NODE_NAME`
- its own workspace root under `CODEX_SWARM_WORKSPACE_ROOT/nodes/`
- the same tailnet-only API and local Codex executor

Run a real hosted multi-agent proof with:

```bash
corepack pnpm ops:tailnet:multi-agent-proof
```

This service registers a real worker node with the hosted control plane and
executes claimed dispatch assignments on the local host.

Required worker env:

- `CODEX_SWARM_NODE_ID`
- `CODEX_SWARM_NODE_NAME`
- `CODEX_SWARM_CAPABILITIES`
- `CODEX_SWARM_CODEX_COMMAND`
- optional `CODEX_SWARM_WORKER_POLL_INTERVAL_MS`
- optional `CODEX_SWARM_RECONCILE_ON_START`

The worker service now:

- registers the node
- sends periodic heartbeats
- reconciles stale leases on startup
- claims queued dispatch assignments
- materializes workspaces under `CODEX_SWARM_WORKSPACE_ROOT`
- executes Codex requests locally via `codex exec`
- reports completion or retry/failure state back to the control plane

The checked-in daemon entrypoint is:

- `apps/api/src/ops/local-worker-daemon.ts`

There is no heartbeat-only fallback in this deployment path. If the local Codex
executor or worker dependencies are not usable, the service fails instead of
pretending the host is execution-ready.
