# CI and Deployment Gate

This repository ships a post-M10 GitHub Actions gate for validation and Vercel deployment.

## Workflows

- `CI` runs on every pull request and on pushes to `main`.
- `Deploy Vercel` runs after a successful `CI` workflow or manually through `workflow_dispatch`.

The current workflow audit is recorded in
[docs/architecture/post-m10-ci-audit.md](/home/florian/codex-swarm/docs/architecture/post-m10-ci-audit.md).

## CI behavior

The CI workflow installs Node.js 22 and pnpm 10.28.0 once per job through the
shared setup action and then runs four explicit gates:

- `pnpm ci:lint`
- `pnpm ci:typecheck`
- `pnpm ci:test`
- `pnpm ci:build`

Gate order and purpose:

1. `lint`
2. `typecheck`
3. `test`
4. `build`

Those commands delegate into workspace packages and only execute scripts that
actually exist under the workspace package roots:

- `apps/*`
- `packages/*`
- `services/*`
- `tooling/*`

Each gate runs as a separate GitHub job so the failing surface is obvious in the
Checks UI. A final summary job records the result of every gate and the exact
local reproduction command.

## Dependency review

Pull requests also run GitHub's dependency review action and fail if a change introduces a dependency vulnerability at `high` severity or above.

## Vercel deployment behavior

The Vercel workflow is intentionally separate from CI validation. It deploys
only when all of the following are true:

1. The `CI` workflow completed successfully, or an operator triggered
   `workflow_dispatch`.
2. A deployable app exists at `frontend`.
3. The repository has these Actions secrets configured:
   - `VERCEL_TOKEN`
   - `VERCEL_ORG_ID`
   - `VERCEL_PROJECT_ID`
4. The run is not a forked `workflow_run` that would expose deployment secrets
   to untrusted code.

If those conditions are not met, the workflow exits with a clear skip reason in
the step summary instead of failing with opaque Vercel CLI noise.

Preview deployments are the default. Production deployments happen only when CI
completed successfully for a push to `main`, or when a manual dispatch chooses
the `production` target explicitly.

The workflow follows Vercel's current GitHub Actions guidance by:

1. Pulling environment settings with `vercel pull`
2. Building inside GitHub Actions with `vercel build`
3. Uploading the prebuilt output with `vercel deploy --prebuilt`

## Local reproduction

Run the same validation gate locally with:

```bash
corepack pnpm ci:lint
corepack pnpm ci:typecheck
corepack pnpm ci:test
corepack pnpm ci:build
```

For a manual Vercel reproduction from `frontend/`:

```bash
pnpm dlx vercel@latest pull --yes --environment=preview --token="$VERCEL_TOKEN"
pnpm dlx vercel@latest build --token="$VERCEL_TOKEN"
pnpm dlx vercel@latest deploy --prebuilt --token="$VERCEL_TOKEN"
```

For production, switch the pull environment to `production` and add `--prod` to
the deploy step.

## Package expectations

Every workspace package should define the standard scripts it actually supports:

- `lint`
- `typecheck`
- `test`
- `build`

Once those scripts exist, the CI gate will pick them up automatically without
needing per-package workflow edits.
