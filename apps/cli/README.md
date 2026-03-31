# Codex Swarm CLI

This package provides the `codex-swarm` command.

Current release-1 scope:

- `codex-swarm doctor`
- `codex-swarm install`
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
```

Use a GitHub identity with package read access when `npm login` prompts.
