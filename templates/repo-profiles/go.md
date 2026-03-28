# Go Profile

## Use When

- the target repo is a Go service, CLI, or multi-module repository

## Baseline Layout

- `go.mod` at the relevant root
- reproducible `go test` and build entrypoints
- environment bootstrap documented
- CI entrypoints for lint, test, and binary build

## Swarm Defaults

- implementer: endpoint, worker, or CLI feature slice
- reviewer: concurrency and cleanup semantics review
- tester: integration and recovery validation
- leader: milestone readiness and release handoff

## Recommended Skills

- `plan-from-spec`
- `create-task-dag`
- `validate-milestone`
- `prepare-pr`
