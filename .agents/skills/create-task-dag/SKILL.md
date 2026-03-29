---
name: create-task-dag
description: Translate a delivery plan into a dependency-safe task graph.
---

# create-task-dag

## Purpose

Translate a delivery plan into a dependency-safe task graph.

## Inputs

- active milestone plan
- delivery tracks and owners
- current board state

## Outputs

- implementation tasks
- refinement and QA gates
- explicit blocker relationships

## Workflow

1. Start from the plan, not from ad hoc implementation ideas.
2. Create one task per independently shippable slice.
3. Add blockers only where sequencing is actually required.
4. Keep backend, frontend, QA, and infrastructure tasks parallel where possible.
5. Re-check the board after creation to confirm the DAG is sane.

## Guardrails

- do not encode fake blockers
- do not merge planning and implementation into the same task
- do not leave verification implied; add it explicitly
