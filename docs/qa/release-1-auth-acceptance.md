# Release-1 Auth Acceptance

Date: 2026-04-02
Owner: qa-engineer
Source of truth: `.swarm/plan.md`, `.swarm/release-1-auth-execution-plan.md`

## Verdict

- ready pending routine re-runs of the listed commands on release candidates

## Summary

Release-1 authentication is implemented as session-cookie-first browser auth
with explicit public-route and service-credential exceptions. The acceptance
bar for this slice is:

- first-admin bootstrap succeeds once and fails cleanly on repeat
- protected browser and API surfaces reject anonymous access by default
- login, logout, and session-probe behavior match the shipped frontend
- worker and local-daemon service credentials still function on scoped routes
- release runtime-config output does not ship bearer-token material unless the
  explicit legacy-dev fallback is enabled

## Acceptance Evidence

### 1. Backend auth routes and bootstrap semantics

- `corepack pnpm --dir apps/api exec vitest run test/auth-routes.test.ts test/auth-service.test.ts`
- Covers:
  - valid login sets `codex_swarm_session`
  - invalid credentials return generic `401`
  - logout clears the cookie and revokes the session
  - `GET /api/v1/auth/session` returns a `200` unauthenticated payload when no
    valid session exists
  - public-route and protected-route boundary behavior
  - first bootstrap-admin success and repeat-run failure

### 2. Backend app acceptance boundary

- `corepack pnpm --dir apps/api exec vitest run test/app.test.ts`
- Required acceptance points in that file:
  - anonymous access is limited to landing and public assets
  - operational shell routes require a valid session
  - scoped service credentials work on allowed worker/control-plane routes
  - invalid, mis-scoped, or legacy bearer credentials do not bypass release auth

### 3. Frontend auth flow

- `corepack pnpm --dir frontend exec vitest run src/App.auth.test.tsx`
- Covers:
  - unauthenticated load renders login instead of the operational shell
  - release mode does not inject the legacy bearer token
  - successful login hydrates the shell
  - logout returns the user to login
  - expired-session handling clears protected state and returns to login

### 4. Release runtime-config and shipped installer assets

- `corepack pnpm --dir apps/cli exec vitest run test/frontend-runtime-config.test.ts test/single-host.test.ts`
- Covers:
  - runtime-config omits `apiToken` when `AUTH_ENABLE_LEGACY_DEV_BEARER=false`
  - runtime-config includes `apiToken` only when the explicit legacy fallback is enabled
  - shipped API unit templates do not export `VITE_API_TOKEN` by default

### 5. Operator and release docs

- Check:
  - `README.md`
  - `docs/operator-guide.md`
  - `docs/operations/single-host-install.md`
  - `docs/operations/security.md`
  - `docs/operations/tailnet-instance.md`
- Acceptance points:
  - install flow is `install -> bootstrap-admin -> browser login`
  - release browser auth is documented as HttpOnly session-cookie based
  - public/protected route boundary is explicit
  - legacy bearer auth is documented as debug-only

## Residual Risks

- The broad app-level acceptance file still serves as an integration harness for
  many non-auth behaviors. Future auth changes must preserve its default test
  harness assumptions or update the harness explicitly.
- The acceptance set is strong at the automated route, session, and installer
  boundaries, but bootstrap-admin still benefits from an occasional fresh-db
  operator smoke run before release packaging.
