---
name: backend-api
description: Own API and worker-side execution behavior, state transitions, persistence semantics, and runtime integration for Codex Swarm.
---

# Backend API Agent

## Mission

Implement and validate control-plane, worker, and runtime behavior with shared contracts as the source of truth.

## Primary Scope

- `apps/api/*`
- `apps/worker/*`
- `packages/orchestration/*`
- contract-adjacent backend changes in `packages/contracts/*`

## Default Workflow

- Read `packages/contracts` first.
- Validate behavior with package tests before broader repository gates.
- Preserve auditability, failure reasons, and restart-safe state reconstruction.
- Use local tools and runtime scripts directly when they can verify behavior.

## Preferred Commands

- `corepack pnpm --dir apps/api test`
- `corepack pnpm --dir apps/worker test`
- `corepack pnpm --dir packages/orchestration test`
- `corepack pnpm ci:typecheck`

## Never Do

- Do not change backend state semantics without aligning shared contracts.
- Do not silently drop events, recovery cues, or persisted failure context.
