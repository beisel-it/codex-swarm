# Governance Security Operations

## Secret Integration Path

Codex Swarm supports one external-manager pattern for governed repositories in M5:

- `SECRET_SOURCE_MODE=environment`: default local and low-friction path for standard repositories
- `SECRET_SOURCE_MODE=external_manager` with `SECRET_PROVIDER=vault`: governed-repo path for sensitive policy profiles

This is intentionally narrow. M5 does not add provider-specific branching per feature.

## Release Auth Configuration

Release-1 browser auth is session-cookie based. Operators should configure and
review these settings in the installed env file:

- `AUTH_SESSION_COOKIE_NAME`: cookie name for the browser session. Defaults to `codex_swarm_session`.
- `AUTH_SESSION_TTL_SECONDS`: server-side session lifetime in seconds. Defaults to 7 days.
- `AUTH_SESSION_COOKIE_SAME_SITE`: cookie `SameSite` policy. Supported values are `lax`, `strict`, and `none`. Defaults to `lax`.
- `AUTH_SESSION_COOKIE_SECURE`: explicit secure-cookie override. When unset, production defaults to secure cookies and development defaults to non-secure cookies.
- `AUTH_PASSWORD_SCRYPT_N`
- `AUTH_PASSWORD_SCRYPT_R`
- `AUTH_PASSWORD_SCRYPT_P`
- `AUTH_PASSWORD_SCRYPT_KEYLEN`

The password settings control the Node `scrypt` password hashing parameters used
for persisted local email/password credentials. Keep them aligned with your host
capacity and change-control posture.

## Auth Boundary

Release defaults:

- public without login: `GET /health`, `/webhooks/*`, and the landing/static frontend surface
- protected: all operational UI routes and all non-webhook `/api/v1/*` routes
- browser login path: `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, and `GET /api/v1/auth/session`

The browser UI authenticates through an HttpOnly session cookie. Release docs
should not instruct operators to paste bearer tokens into the browser path.

## Service Credential Boundary

Release worker and local-daemon control-plane traffic uses a separate,
scoped service credential path:

- `AUTH_SERVICE_TOKEN`: API-side shared secret for service callers
- `CODEX_SWARM_SERVICE_TOKEN`: worker/local-daemon secret sent as the bearer credential
- `CODEX_SWARM_SERVICE_NAME`: worker/local-daemon identity name sent in `x-codex-service-name`

Keep the API and worker token values aligned, rotate them together, and do not
reuse this path for browser or general operator access. This service credential
path is valid only for the worker/local-daemon routes explicitly allowed by the
auth plugin.

## Legacy Dev Bearer Fallback

The previous bearer-token model remains available only as an explicit local or
internal debugging fallback.

- enable it with `AUTH_ENABLE_LEGACY_DEV_BEARER=true`
- set `DEV_AUTH_TOKEN` to the expected bearer token value
- keep it disabled for normal release installs

This fallback does not change the release route boundary and should not be
documented as the primary operator login path.

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
