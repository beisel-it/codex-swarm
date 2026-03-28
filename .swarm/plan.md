# Codex Swarm Initial Execution Plan

## Goal

Build the first executable Codex Swarm vertical slice in TypeScript, starting from a repository that currently contains only planning documents.

## Active Task Graph

### In progress

- `176b8c8c` Freeze architecture and define M0/M1 execution graph
- `c44ac7ef` Bootstrap TypeScript workspace and backend service skeleton

### Blocked follow-ons

- `ac5de322` Implement control plane domain model and API vertical slice
- `d8c07c6b` Implement worker supervisor and Codex session lifecycle spike
- `76e5d78b` Build board UI shell and run/task views
- `b42c2964` Set up local dev stack and CI baseline
- `7f6c151d` Set up test harness and first API/worker integration coverage
- `faaf1347` Author initial architecture docs and repo conventions

## Dependency Order

1. Freeze architecture and shared repo conventions.
2. Bootstrap the TypeScript workspace and backend skeleton.
3. Build the durable backend API and worker runtime primitives.
4. Add the board shell and validation pipeline.
5. Unblock QA for the first automated coverage pass.

## Execution Rules

- Build only what is required for M0/M1 until the first vertical slice is running.
- Shared contracts live in one package and are consumed by API, worker, and web.
- Each completed task must end with a git commit before the task is marked complete.
- Blocked tasks should stay blocked until their prerequisites land in the repository.
