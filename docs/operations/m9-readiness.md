# M9 Readiness Runbook

This runbook prepares the repo for task `15dc096b` without starting the M9
scenario itself.

Source of truth:

- `docs/architecture/m9-readiness-plan.md`

This runbook only covers the devops-owned readiness slice:

- fresh-workdir creation
- isolated-run directory boundaries
- environment variables and paths
- pre-run operator checks needed before the scenario starts

It does not dispatch the M9 run.

## 1. Preconditions

Do not prepare or start the M9 scenario until these are true:

1. QA has declared the shared branch stable enough for the exercise.
2. The intended branch has current green workspace verification:
   - `corepack pnpm ci:typecheck`
   - `corepack pnpm ci:test`
   - `corepack pnpm ci:build`
3. No unrelated in-flight work is expected to contaminate the exercise.
4. The designer and developer playbooks, plus the QA acceptance checklist, are
   already checked in.

## 2. Prepare the isolated M9 directory tree

Use the checked-in helper:

```bash
corepack pnpm ops:m9:prepare
```

Optional overrides:

```bash
M9_ROOT_DIR=/absolute/path/to/m9-runs \
M9_RUN_LABEL=m9-readiness-001 \
corepack pnpm ops:m9:prepare
```

The helper creates:

- `workspace/`
- `artifacts/`
- `screenshots/`
- `logs/`
- `transcripts/`
- `manifest.json`
- `m9.env`

The command does not start the scenario. It only prepares the layout.

## 3. Paths and scope rules

Use the generated `runRoot` as the only in-scope filesystem boundary for the
M9 exercise evidence.

Expected path usage:

- `workspace/`
  - the fresh working directory for the landing-page exercise
- `artifacts/`
  - captured design handoffs, generated review payloads, or exported evidence
- `screenshots/`
  - browser or design screenshots used during acceptance
- `logs/`
  - operator notes, command logs, and runtime captures
- `transcripts/`
  - saved agent/operator transcripts when the scenario run is active later

Guardrails:

- do not reuse the main repo root as the M9 working directory
- do not mix M9 evidence into unrelated `.swarm/` or task-local folders
- do not capture acceptance evidence outside the generated `runRoot`

## 4. Environment variables for the future scenario run

The helper writes `m9.env` with placeholders. Before the real M9 run, fill in:

- `M9_BASE_URL`
  - the control-plane API base URL to use for the exercise
- `M9_AUTH_TOKEN`
  - the bearer token for `/api/v1/*`
- `M9_REPOSITORY_URL`
  - optional provider-backed sample repo URL if the scenario uses one
- `M9_WORKSPACE_ROOT`
  - the generated fresh working directory
- `M9_ARTIFACTS_ROOT`
  - isolated evidence directory
- `M9_SCREENSHOTS_ROOT`
  - screenshot output directory
- `M9_LOGS_ROOT`
  - operator log directory
- `M9_TRANSCRIPTS_ROOT`
  - transcript and handoff record directory

## 5. Isolation procedure

Before `15dc096b` is dispatched:

1. Confirm the shared branch is clean enough for M9:

   ```bash
   git status --short
   corepack pnpm ci:typecheck
   corepack pnpm ci:test
   corepack pnpm ci:build
   ```

2. Prepare the M9 directory tree with `ops:m9:prepare`.
3. Record the generated `manifest.json` path in the readiness review.
4. Keep the future scenario work inside the generated `workspace/` path.
5. Keep the leader out of implementation work; the scenario must use the
   designer and developer roles rather than ad hoc operator coding.

## 6. Runtime surfaces that are in scope later

When the actual scenario starts, these repo surfaces are the supported control
paths:

- `README.md`
- `docs/operator-guide.md`
- `docs/operator-skill-library.md`
- `docs/operator-skill-workflows.md`
- `GET /health`
- `GET /api/v1/metrics`
- `GET /api/v1/runs/:id`
- `GET /api/v1/events`
- `GET /api/v1/artifacts/:id`
- `GET /api/v1/artifacts/:id/content`

## 7. What to record for the readiness review

The devops readiness handoff should include:

- the `ops:m9:prepare` output
- the generated `manifest.json` path
- the chosen `runRoot`
- the exact env vars expected for the scenario run
- any contamination risks still present on the shared branch

If any of those are missing, M9 is not ready.
