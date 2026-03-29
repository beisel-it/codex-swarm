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
the checked-in operator workflows.

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

With user lingering enabled, these services restart automatically on boot
without exposing the database or cache beyond loopback.
