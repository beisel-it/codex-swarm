# Supported Versions

## Release line

Codex Swarm is currently in an early `0.x` release phase.

Support expectations:

- the latest tagged `0.x` release is the primary supported release
- earlier `0.x` releases may receive best-effort guidance, but not guaranteed
  fixes
- schema/config compatibility must still match the control-plane version checks
  exposed by `/health`

## Deployment boundary

Supported for the current release line:

- private self-hosted
- single-host managed deployment
- optional same-host worker fan-out

Not yet supported as stable release commitments:

- public-browser-safe deployments
- generalized remote-worker onboarding across multiple hosts
- claims of zero-checkout or one-binary installation

## Upgrade expectation

Operators should:

1. take a backup before upgrading
2. run migrations before reopening traffic
3. verify `/health`
4. validate at least one API, UI, and worker path after upgrade
