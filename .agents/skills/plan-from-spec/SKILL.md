---
name: plan-from-spec
description: Turn a product spec or roadmap slice into an executable engineering plan.
---

# plan-from-spec

## Purpose

Turn a product spec or roadmap slice into an executable engineering plan.

## Inputs

- a spec, milestone, or roadmap section
- current repository layout
- known blockers, dependencies, and already-completed slices

## Outputs

- milestone scope summary
- explicit execution tracks by owner
- dependency ordering
- exit criteria tied to code and verification

## Workflow

1. Read the relevant spec and roadmap sections.
2. Identify user-visible outcomes, non-goals, and hard dependencies.
3. Split the milestone into concurrent tracks with one owner each.
4. Write or update the plan in `.swarm/plan.md` or `docs/architecture/`.
5. Open follow-on tasks only after the sequence is coherent.

## Done When

- the milestone has a concrete execution order
- each track has a crisp deliverable
- exit criteria are testable in the repository
