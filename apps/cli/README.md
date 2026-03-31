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
codex-swarm install --version latest --dry-run
codex-swarm install --version latest
codex-swarm install --install-root ~/.local/share/codex-swarm/install --start --yes
```
