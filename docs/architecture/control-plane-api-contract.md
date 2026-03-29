# Control-Plane API Contract

## Purpose

This document records the delivered replacement for the roadmap's planned
Swarm Control MCP surface.

Codex Swarm does not ship a separate MCP server for control-plane operations.
Instead, the supported integration boundary is the Fastify HTTP API in
`apps/api`, while MCP remains an internal worker-to-Codex runtime concern.

This is an intentional supersession decision, not an unowned omission.

## Decision

- Delivered contract: HTTP routes under `/api/v1`
- Undelivered contract: separate Swarm Control MCP server and tool catalog
- Internal runtime boundary retained: worker runtime launches Codex via
  `codex mcp-server`, but that process is not the external control-plane API

The practical effect is that frontend, smoke-test, and operator integrations
should target the HTTP control plane directly.

## Supersession Mapping

| Planned MCP tool | Delivered HTTP replacement | Live evidence |
| --- | --- | --- |
| `run_context.get` | `GET /api/v1/runs/:id` for run detail, plus `GET /api/v1/runs/:id/audit-export` for expanded audit context | `apps/api/src/routes/runs.ts`, `apps/api/test/app.test.ts` |
| `task.list` | `GET /api/v1/tasks?runId=<id>` | `apps/api/src/routes/tasks.ts`, `apps/api/test/app.test.ts` |
| `task.create` | `POST /api/v1/tasks` | `apps/api/src/routes/tasks.ts`, `apps/api/test/app.test.ts` |
| `task.update` | `PATCH /api/v1/tasks/:id/status` | `apps/api/src/routes/tasks.ts`, `apps/api/test/app.test.ts` |
| `message.send` | `POST /api/v1/messages` | `apps/api/src/routes/messages.ts`, `apps/api/test/app.test.ts` |
| `message.list` | `GET /api/v1/messages?runId=<id>` | `apps/api/src/routes/messages.ts`, `apps/api/test/app.test.ts` |
| `artifact.publish` | `POST /api/v1/artifacts` | `apps/api/src/routes/artifacts.ts`, `apps/api/test/app.test.ts` |
| `agent.spawn` | `POST /api/v1/agents` | `apps/api/src/routes/agents.ts`, `apps/api/test/app.test.ts` |
| `agent.status` | `GET /api/v1/agents?runId=<id>` and `GET /api/v1/runs/:id` | `apps/api/src/routes/agents.ts`, `apps/api/src/routes/runs.ts`, `apps/api/test/app.test.ts` |
| `agent.stop` | No one-to-one route. Current lifecycle control is expressed through run status changes, cleanup/recovery operations, and worker-node reconciliation. | `apps/api/src/routes/runs.ts`, `apps/api/src/routes/cleanup-jobs.ts`, `apps/api/src/routes/worker-nodes.ts`, `apps/api/test/control-plane-service.cleanup.test.ts`, `apps/api/test/app.test.ts` |

## Supported Integration Guidance

Use the HTTP control plane when integrating:

- frontend board and review flows
- admin or smoke-test scripts
- internal automation that needs run, task, message, artifact, or agent state

Do not assume the repo provides a standalone control-plane MCP server or tool
transport for these operations.

## Why This Supersession Is Intentional

- The shipped frontend already integrates through HTTP routes exposed by
  `buildApp()` in `apps/api/src/app.ts`.
- The delivered backend contracts live in `packages/contracts/src/index.ts`
  and are exercised by API integration tests in `apps/api/test/app.test.ts`.
- The worker runtime's use of `codex mcp-server` is a runtime execution detail,
  not the external product contract for board, review, or orchestration state.

## Residual Gap

This supersession resolves the parity mismatch for the planned Swarm Control MCP
surface itself. It does not resolve the separate Phase 4 gap around remote/shared
MCP transport for Codex runtime execution.
