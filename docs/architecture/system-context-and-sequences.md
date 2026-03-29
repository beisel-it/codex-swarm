# System Context And Sequences

## Purpose

This document satisfies the roadmap requirement that `docs/architecture/` contain
system-context and sequence-diagram artifacts for the delivered control-plane
shape.

It reflects the implemented TypeScript/Fastify/worker/frontend architecture
rather than the earlier illustrative stack examples in `PRD.md`.

## System Context

```mermaid
flowchart TB
    User[Operator / Reviewer / Developer]
    Frontend[Frontend Board and Review UI]
    API[Control Plane API]
    DB[(Postgres)]
    Redis[(Redis)]
    Worker[Worker Runtime]
    Codex[Codex CLI and MCP Runtime]
    Git[Git Provider or Local Repo]
    Artifacts[Artifacts and Logs]

    User --> Frontend
    User --> API
    Frontend --> API
    API --> DB
    API --> Redis
    API --> Worker
    Worker --> Codex
    Worker --> Git
    Worker --> Artifacts
    API --> Artifacts
```

## Sequence: Run Creation To Task Execution

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant A as Control Plane API
    participant D as Postgres
    participant W as Worker Runtime
    participant C as Codex Runtime

    U->>F: Create run from repository and goal
    F->>A: POST /api/v1/runs
    A->>D: Persist run
    A-->>F: Run created

    F->>A: POST /api/v1/tasks
    A->>D: Persist task DAG state
    A-->>F: Tasks created

    F->>A: POST /api/v1/agents
    A->>D: Persist agent and session metadata
    A-->>F: Agent/session registered

    A->>W: Dispatch session metadata
    W->>C: Start or resume Codex runtime flow
    C-->>W: Session/thread state
    W->>A: Task/message/validation/artifact updates
    A->>D: Persist workflow state
    A-->>F: Updated run/task state for board and review UI
```

## Sequence: Review And Approval Flow

```mermaid
sequenceDiagram
    participant R as Reviewer
    participant F as Frontend
    participant A as Control Plane API
    participant D as Postgres

    R->>F: Open run review surface
    F->>A: GET run, tasks, approvals, validations, artifacts
    A->>D: Read persisted state
    A-->>F: Review payload

    R->>F: Approve or reject with feedback
    F->>A: PATCH /api/v1/approvals/:id
    A->>D: Persist approval resolution and feedback
    A-->>F: Updated approval state
```

## Notes

- This document is the architecture-local home for the roadmap's required
  diagrams.
- The planned Swarm Control MCP surface was intentionally superseded by the
  HTTP control-plane contract documented in
  [`control-plane-api-contract.md`](./control-plane-api-contract.md).
- `PRD.md` still contains earlier diagrams, but `docs/architecture/` is now the
  authoritative location for the shipped implementation view.
