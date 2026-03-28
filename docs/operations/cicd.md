# CI/CD Bootstrap

This repository now ships with a bootstrap GitHub Actions setup that is safe to enable before the application code exists.

## Workflows

- `CI` runs on every pull request and on pushes to `main`.
- `Deploy Vercel` runs on pull requests, pushes to `main`, and manually through `workflow_dispatch`.

## CI behavior

The CI workflow installs Node.js 22 and pnpm 10.28.0, then runs these root scripts:

- `pnpm ci:lint`
- `pnpm ci:typecheck`
- `pnpm ci:test`
- `pnpm ci:build`

Those commands delegate into workspace packages and only execute scripts that actually exist. This keeps the pipeline green while the repo is still being assembled, but automatically starts enforcing checks as packages are added under:

- `apps/*`
- `packages/*`
- `services/*`
- `tooling/*`

## Dependency guardrail

Pull requests also run GitHub's dependency review action and fail if a change introduces a dependency vulnerability at `high` severity or above.

## Vercel deployment behavior

The Vercel workflow is intentionally guarded. It deploys only when both conditions are true:

1. A deployable app exists at `apps/web`, `frontend`, or the repo root with `vercel.json`.
2. The repository has these Actions secrets configured:
   - `VERCEL_TOKEN`
   - `VERCEL_ORG_ID`
   - `VERCEL_PROJECT_ID`

If either condition is missing, the workflow exits cleanly with a skip message instead of failing the pipeline.

Preview deployments run for pull requests. Production deployments run on pushes to `main`.

The workflow follows Vercel's current GitHub Actions guidance by:

1. Pulling environment settings with `vercel pull`
2. Building inside GitHub Actions with `vercel build`
3. Uploading the prebuilt output with `vercel deploy --prebuilt`

## Next integration step for app teams

Every deployable workspace package should define the standard scripts it actually supports:

- `lint`
- `typecheck`
- `test`
- `build`

Once those scripts exist, the CI workflow will pick them up automatically without further pipeline changes.
