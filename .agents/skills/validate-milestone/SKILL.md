---
name: validate-milestone
description: Confirm a roadmap phase is truly complete in code, not only in task metadata.
---

# validate-milestone

## Purpose

Confirm a roadmap phase is truly complete in code, not only in task metadata.

## Inputs

- milestone exit criteria
- current branch state
- board state
- validation commands and runtime checks

## Outputs

- pass or fail decision on milestone readiness
- residual risks and missing surfaces
- next-step tasks if the milestone is incomplete

## Workflow

1. Compare implemented behavior directly against the roadmap exit criteria.
2. Verify shared contracts, runtime routes, UI surfaces, and worker behavior line up.
3. Run the workspace validation commands used by CI.
4. Check for hidden gaps such as mock fallback, missing durability, or incomplete recovery logic.
5. Mark the milestone complete only when the end-to-end path is defensible.

## Required Evidence

- successful verification commands
- concrete file references for delivered surfaces
- explicit statement of remaining gaps if any exist
