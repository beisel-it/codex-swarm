# Codex Swarm

TypeScript pnpm-workspace scaffold for the M0/M1 slice described in [PRD.md](./PRD.md), [ROADMAP.md](./ROADMAP.md), and [docs/architecture/m0-m1-architecture.md](./docs/architecture/m0-m1-architecture.md).

## Workspace Layout

- `apps/api`: Fastify control-plane API scaffold
- `frontend`: frontend shell
- `packages/contracts`: shared Zod schemas and inferred types
- `packages/database`: database package stub plus initial Prisma schema
- `packages/orchestration`: shared orchestration helpers for M1 task behavior

## Setup

1. Install workspace dependencies:
   `corepack pnpm install`
2. Copy `.env.example` to `.env` and set `DATABASE_URL` and `DEV_AUTH_TOKEN`.
3. Start the API package:
   `corepack pnpm --dir apps/api dev`
4. Start the frontend package:
   `corepack pnpm --dir frontend dev`

## Verification

- API typecheck: `corepack pnpm --dir apps/api typecheck`
- Contracts typecheck: `corepack pnpm --dir packages/contracts typecheck`
- Orchestration typecheck: `corepack pnpm --dir packages/orchestration typecheck`
- API tests: `corepack pnpm --dir apps/api test`

Use `Authorization: Bearer <DEV_AUTH_TOKEN>` for `/api/v1/*` requests.
