# Codex Swarm Runbook

## Local Verification

- `corepack pnpm run ci:typecheck`
- `corepack pnpm run ci:test`
- `corepack pnpm run ci:build`

## Core Runtime Surfaces

- API: `corepack pnpm --dir apps/api dev`
- Worker: `corepack pnpm --dir apps/worker dev`
- Frontend: `corepack pnpm --dir frontend dev`

## M3 Notes

- Git provider onboarding and PR handoff are live in the control plane.
- Board surfaces now reflect repository onboarding, publish state, and PR state.
- Governance-lite and quality hardening are still active milestone tracks.
