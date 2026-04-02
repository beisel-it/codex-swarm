# Codex Swarm CLI

This package provides the `codex-swarm` command.

Current release-1 scope:

- `codex-swarm doctor`
- `codex-swarm install`
- `codex-swarm auth bootstrap-admin`
- `codex-swarm api start`
- `codex-swarm worker start`
- `codex-swarm db migrate`
- `codex-swarm tui`

The package assumes it is executed against a built Codex Swarm checkout. Runtime commands launch built JavaScript artifacts directly and do not require `pnpm` or `tsx` at runtime.

The checked-in single-host installer flow is:

```bash
curl -fsSL https://raw.githubusercontent.com/beisel-it/codex-swarm/main/ops/deploy/install-single-host-remote.sh | sh
```

The remote installer downloads a published GitHub Release bundle, extracts the
bundled `codex-swarm` CLI from that bundle, and delegates to the same
bundle-based install flow documented below.

Direct CLI usage remains:

```bash
npm login --scope=@beisel-it --auth-type=legacy --registry=https://npm.pkg.github.com
npm install -g @beisel-it/codex-swarm --registry=https://npm.pkg.github.com
codex-swarm install --version latest --dry-run
codex-swarm install --version latest
codex-swarm install --install-root ~/.local/share/codex-swarm/install --start --yes
codex-swarm auth bootstrap-admin --email admin@example.com --password 'change-me-now' --display-name 'Initial Admin' --yes
```

Use a GitHub identity with package read access when `npm login` prompts.

## `auth bootstrap-admin`

Use this once on a fresh install to create the first browser-login admin. The
command is intentionally non-interactive-capable and requires:

- `--email`
- `--password`
- `--display-name`
- `--yes`

Optional overrides:

- `--workspace-id`
- `--workspace-name`
- `--team-id`
- `--team-name`
- `--install-root`
- `--env-file`

Default behavior:

- creates the first persisted user
- assigns `workspace_admin`
- creates or binds the default workspace/team boundary if it does not already exist

Repeat-run behavior:

- if a user or bootstrap admin already exists, the command fails cleanly
- release-1 does not provide overwrite/reset semantics in this command

Release auth after bootstrap uses browser login plus an HttpOnly session cookie.
Legacy bearer-token auth is a separate dev-only fallback and is not the default
release path.
