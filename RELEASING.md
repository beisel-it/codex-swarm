# Releasing Codex Swarm

## Scope

This repository currently treats release automation and package publication
conservatively.

Current release posture:

- `0.x` release line
- private self-hosted product boundary
- single-host managed deployment is the supported topology
- only non-private workspace packages with complete publish metadata should be
  published

Service packages remain private until their artifact boundaries are stable.

## Tooling

- versioning and release PRs: Changesets
- CI and release automation: GitHub Actions
- package publication: npm Trusted Publishing with GitHub OIDC
- release artifact publication: GitHub Releases

## Maintainer flow

1. Land user-facing or publish-affecting changes on `main`.
2. Add a changeset when the change affects published packages or release notes.
3. Let the `Release` workflow open or update the release PR.
4. Review the release PR for:
   - version bumps
   - generated changelog entries
   - package scope and publish intent
5. Merge the release PR to `main`.
6. The `Release` workflow publishes non-private packages through trusted
   publishing, creates GitHub Releases, and uploads the single-host tarball.

## Common commands

```bash
corepack pnpm changeset
corepack pnpm changeset status --verbose
corepack pnpm release:bundle
corepack pnpm release:version
corepack pnpm release:publish
```

## Preconditions before publishing

- package metadata is complete for every publish target:
  - `name`
  - `version`
  - `license`
  - `repository`
  - `bugs`
  - `homepage`
  - `files`
  - `main` / `types` / `exports` where applicable
- the package builds from checked-in source in CI
- the single-host release bundle builds successfully in CI
- the supported-version and support-boundary docs are still accurate

## Current assumptions

- the primary public publish target is the `codex-swarm` CLI package
- the primary install artifact is `codex-swarm-single-host-<version>.tar.gz`
- API, worker, frontend, landing, and database packages remain private for now
- deployment/install docs must stay aligned with the actual release boundary in
  `docs/operations/supported-versions.md`
