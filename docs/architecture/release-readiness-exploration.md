# Release Readiness Exploration

## Purpose

This document captures the current-state exploration for making Codex Swarm
release-ready without expanding the product surface.

The goal is not to add roadmap features. The goal is to identify what is still
missing so a technically capable team can install, deploy, operate, and upgrade
the current product with a straight face.

## Recommended Release Cut

Treat the first credible release as:

- private self-hosted
- single-host managed deployment
- npm-installed `codex-swarm` CLI plus GitHub Releases as the primary
  distribution story

Explicitly do **not** treat these as release-1 requirements:

- public-internet browser deployment with a new auth/session model
- fully documented generalized remote-worker join flow
- artifact-free one-binary deployment
- broad multi-node support claims beyond bounded operator evaluation

## Current Reality

Codex Swarm already has the core product surfaces and operator workflows, but
the release story is still checkout-centric.

Today the strongest path is:

- clone the repo
- install Node and pnpm
- copy local env by hand
- run API, frontend, and worker from source
- rely on internal operator docs and repo knowledge for deployment details

The systemd-based hosted path is also repo-centric:

- services run against a checkout
- API and worker execute source through `tsx`
- services run `pnpm install` on startup
- frontend runtime config injects an API token for private deployments

That is sufficient for internal operation, but not yet a credible public
release story.

## Gap Matrix

| Area                      | Status            | What is missing                                                                                                                                                                                                                          |
| ------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product core              | `partially ready` | Core browser/API/worker surfaces exist, but release packaging and onboarding are not finished.                                                                                                                                           |
| Single-host deployment    | `partially ready` | Docs and systemd templates exist, but install is host-specific, repo-specific, and not artifact-based.                                                                                                                                   |
| CLI install story         | `partially ready` | An initial `codex-swarm` package now exists with `doctor`, `install`, API, worker, migration, and TUI entrypoints, and it now targets a GitHub Release bundle instead of a checkout; the remaining work is hardening and rollout polish. |
| Worker onboarding         | `partially ready` | The release path now centers on the built `local-worker-daemon`, but the repo still carries legacy/internal worker entry surfaces that need continued de-emphasis.                                                                       |
| Package publication       | `missing`         | Packages are private, point at TS source, and do not define publish-safe tarball boundaries.                                                                                                                                             |
| Release automation        | `partially ready` | `changesets`, GitHub Release asset generation, and trusted-publishing-oriented workflow wiring are checked in, but the first real published release still needs to be exercised.                                                         |
| README deployment story   | `partially ready` | README now distinguishes local evaluation from deployment and links to the single-host install path, but the full polished deployment section still needs final release wording.                                                         |
| Repo hygiene              | `partially ready` | Root `LICENSE`, `SECURITY.md`, `SUPPORT.md`, `CONTRIBUTING.md`, supported-version policy, and real Dependabot config now exist, but the public support boundary still needs continued enforcement in docs and packaging.                 |
| Public browser hosting    | `blocked`         | Current frontend runtime-config model injects auth tokens into static assets and is only credible for private deployments.                                                                                                               |
| Multi-node remote workers | `partially ready` | Runtime building blocks exist, but the onboarding and support claim are not production-ready.                                                                                                                                            |

## Blocking Findings

### 1. The install story has started, but is still checkout-centric

There is now an installable `codex-swarm` package under `apps/cli`, plus a
checked-in single-host installer flow and dry-run path.

The remaining problem is not “no command exists” anymore. The remaining problem
is that the CLI still expects a built Codex Swarm checkout at the selected
install root.

Implication:

- release users now have a real command surface
- but the command still fronts a checkout-oriented deployment model instead of
  a true release artifact bundle

### 2. Deployment is source-driven instead of artifact-driven

The current managed deployment path depends on:

- a live repo checkout on the host
- `pnpm install --frozen-lockfile` during service startup
- `tsx` against source entrypoints
- host-specific `WorkingDirectory` assumptions

Implication:

- restart behavior depends on networked dependency install
- deployment is not relocatable or release-bundle-friendly
- worker/API packaging boundaries are still blurry

### 3. Worker onboarding is inconsistent

There are currently two worker stories:

- `pnpm dev:worker` from the workspace
- the managed daemon under `apps/api/src/ops/local-worker-daemon.ts`

They do not share one canonical operator contract, and env naming is still
split (`CODEX_SWARM_POSTGRES_URL` vs `CODEX_SWARM_DATABASE_URL`).

Implication:

- README onboarding is misleading for a fresh user
- real worker execution readiness is easy to misconfigure

### 4. Package publication is not prepared

Current packages are still private and several internal packages expose raw
TypeScript entrypoints instead of built JS from `dist`.

Implication:

- npm publication would be broken or misleading today
- tarballs would ship too much internal material unless bounded with `files`
  allowlists or `.npmignore`

### 5. Release automation has started, but publication is not complete

There is now a `changesets` configuration and a release workflow, but the full
publication story is still incomplete.

What is still missing:

- trusted npm publishing instead of long-lived tokens
- release artifacts attached to GitHub Releases
- final package publication boundaries and changelog discipline
- validated end-to-end release execution on tagged versions

Implication:

- release work is no longer purely ad hoc
- but the pipeline still is not strong enough yet to claim a polished public
  install and release loop

### 6. Public browser release is currently out of scope

The hosted frontend runtime config writes API token data into static runtime
assets. That is acceptable only for private/tailnet-style deployments.

Implication:

- release 1 must explicitly be private self-hosted
- public browser release requires a separate auth/session redesign

## Recommended Release-1 Shape

### Supported topology

Release 1 should support exactly one deployment shape:

- one host
- API, frontend, and worker on that host
- shared local Postgres and Redis for that host
- optional additional workers on the same host only

Document remote-worker and public-browser deployment as explicitly unsupported
or experimental for this release cut.

### Distribution model

Primary distribution:

- npm package `codex-swarm`
- GitHub Release with versioned artifacts and release notes

Fallback distribution:

- GitHub Release install script and tarball

Do not make repo checkout the primary install path.

### CLI contract

Release 1 should expose a public CLI package with these commands:

- `codex-swarm doctor`
- `codex-swarm install`
- `codex-swarm api start`
- `codex-swarm worker start`
- `codex-swarm db migrate`
- `codex-swarm tui`

Release 1 CLI behavior should be:

- built JS only
- no `pnpm` or `tsx` dependency at runtime
- one canonical env contract
- clear exit codes and preflight failures

### Installer contract

The installer should be safe and explicit:

- show or save the script before execution
- require explicit confirmation before mutation
- support dry-run
- validate dependencies before writing files or enabling services
- install systemd user units and env templates idempotently

Recommended release-1 scope:

- single-host installer only
- optional same-host worker fan-out as an explicit follow-up command

### Packaging boundary

Release 1 should keep service packaging conservative:

- public package: `codex-swarm`
- candidate public libraries: `@codex-swarm/contracts`,
  `@codex-swarm/orchestration`
- keep API, worker, frontend, and database packages private until their
  artifact boundaries are cleaned up

For every published package:

- point `main` and `exports` to built `dist`
- add `types` from built outputs
- add `files` allowlists
- exclude tests, local state, and `.swarm`
- add package metadata (`license`, `repository`, `bugs`, `homepage`)

## Recommended Release Process

### Versioning

Treat these as separate version surfaces:

- product release version
- npm package versions
- schema/config compatibility versions already exposed by the control plane

The product release version should become the human-facing version in docs,
installer output, and GitHub Releases.

### Automation choice

Recommended default: `Changesets`

Reason:

- the repo is already a monorepo
- package publication is part of the target state
- release PRs and changelog generation are lower-friction than fully ad hoc
  manual releases

Recommended automation stack:

- `changesets`
- `changesets/action`
- GitHub Release generation
- npm trusted publishing for public packages

Only prefer `release-please` instead if package publication is later deferred
and the release unit is reduced to the app/repo alone.

### Release flow

Release 1 should require:

1. green CI
2. release PR with version/changelog changes
3. explicit release approval
4. tag creation
5. GitHub Release publication
6. npm publication for public packages
7. attached release artifacts
8. linked upgrade and rollback notes

## Documentation Package Required for Release 1

### README role

The README should become the fast path for:

- what Codex Swarm is
- who it is for
- supported release-1 topology
- installation entrypoint
- deployment entrypoint
- where deeper operator docs live

It should stop trying to serve as a partial operator runbook.

### README deployment section shape

The README should eventually include a deployment section with this structure:

1. **Support boundary**
   - private self-hosted
   - single-host managed deployment
   - optional same-host worker fan-out
2. **Install the CLI**
   - `npm install -g codex-swarm`
   - GitHub Release fallback
3. **Inspect the installer**
   - safe one-line script flow
   - explicit confirmation model
4. **Deploy a single host**
   - `codex-swarm install`
   - env file location
   - service enable/start
5. **Validate the deployment**
   - `codex-swarm doctor`
   - `/health`
   - first worker presence
   - first UI check
6. **Read next**
   - single-host deployment guide
   - upgrade path
   - backup/restore
   - troubleshooting

### Required linked docs

Release 1 should have a clean doc set behind that README section:

- install and CLI guide
- single-host deployment guide
- worker onboarding guide
- upgrade path
- backup/restore guide
- troubleshooting guide
- support boundary and unsupported deployment shapes

## Implementation Milestones

### Milestone 1: define the release floor and support boundary

- explicitly document release-1 topology and unsupported paths
- rewrite README and deployment docs around the single-host managed story
- add missing repo hygiene files

Status: largely in progress. The release-readiness document, supported-version
policy, and security/support files now exist, and README has a deployment
direction section.

### Milestone 2: ship a real CLI package

- create public `codex-swarm` package with `bin`
- wrap built JS entrypoints for API, worker, TUI, migrations, and doctor
- standardize env loading and preflight diagnostics

Status: in progress. The package, bin, doctor flow, and single-host install
command now exist, but the CLI still assumes a built checkout.

### Milestone 3: make deployment artifact-based

- build API and worker to runnable release artifacts
- stop using `tsx` source execution in managed deployment
- stop running `pnpm install` inside systemd startup
- make unit templates relocatable

### Milestone 4: unify worker onboarding

- choose one canonical worker daemon path
- normalize env naming and required variables
- add installer-driven worker provisioning for single-host release 1
- narrow or complete the remote-worker story

### Milestone 5: add release automation

- add Changesets
- add release workflow
- add GitHub Release generation
- add npm trusted publishing for public packages

Status: partially complete. Changesets and a release workflow are checked in;
trusted publishing and release artifact publication remain open.

### Milestone 6: finish the release docs package

- add the release-1 deployment section to README
- add operator-facing install/deploy docs
- add troubleshooting and support-boundary docs

Status: in progress. README now points at the single-host install path and the
release boundary, but still needs the final tighter deployment section wording
before calling the project release-ready.

## Acceptance Criteria for Release Readiness

Do not call the project release-ready until all of these are true:

- a user can install `codex-swarm` and get a command in `PATH`
- a user can deploy the supported single-host topology without a repo checkout
  as the primary story
- a worker can be onboarded through one canonical documented path
- release artifacts are versioned and published through an automated flow
- the README deployment section is accurate and low-friction
- repo trust signals exist (`LICENSE`, security/reporting guidance, supported
  version policy)
- unsupported paths are called out explicitly instead of being implied by old
  internal docs

## Deferred Work After Release 1

These should be tracked as explicit later phases, not quietly implied in the
release story:

- public-browser-safe auth/session model
- generalized remote-worker join/install flow
- stronger multi-node support claims
- broader package publication beyond the CLI and stable shared libraries
