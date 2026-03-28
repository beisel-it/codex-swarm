# Governance Security Operations

## Secret Integration Path

Codex Swarm supports one external-manager pattern for governed repositories in M5:

- `SECRET_SOURCE_MODE=environment`: default local and low-friction path for standard repositories
- `SECRET_SOURCE_MODE=external_manager` with `SECRET_PROVIDER=vault`: governed-repo path for sensitive policy profiles

This is intentionally narrow. M5 does not add provider-specific branching per feature.

## Distribution Boundary

- API/control-plane owns policy evaluation and decides whether secret access is `allowed`, `brokered`, or `denied`.
- Remote workers receive only task-scoped environment variables listed in `REMOTE_SECRET_ENV_NAMES`.
- Sensitive policy profiles should use the brokered path instead of long-lived node-level credentials.
- Repository trust level must be inside `SECRET_ALLOWED_TRUST_LEVELS` before any governed secret path is considered.

## Operator Workflow

1. Set retention defaults with `RETENTION_RUN_DAYS`, `RETENTION_ARTIFACT_DAYS`, and `RETENTION_EVENT_DAYS`.
2. Inspect governance state with `GET /api/v1/admin/governance-report`.
3. Dry-run retention with `POST /api/v1/admin/retention/reconcile` and `{ "dryRun": true }`.
4. Apply retention metadata with the same route and `{ "dryRun": false }`.
5. Check a governed repository secret path with `GET /api/v1/admin/secrets/access-plan/:repositoryId`.

## Policy Notes

- `standard` repositories can use the default environment-based path.
- Profiles listed in `SENSITIVE_POLICY_PROFILES` are treated as governed and should prefer the brokered secret path.
- Repositories outside `SECRET_ALLOWED_TRUST_LEVELS` are denied secret access by default.
