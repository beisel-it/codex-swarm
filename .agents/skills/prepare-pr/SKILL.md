---
name: prepare-pr
description: Take a completed milestone slice from local branch state to a reviewable pull request handoff.
---

# prepare-pr

## Purpose

Take a completed milestone slice from local branch state to a reviewable pull request handoff.

## Inputs

- clean git status
- merged or committed implementation work
- validation results

## Outputs

- commit summary
- PR title and body draft
- handoff notes for reviewer and QA

## Workflow

1. Confirm the worktree is clean and verification is current.
2. Summarize user-facing outcomes and operational changes.
3. Call out schema, migration, cleanup, and rollout implications.
4. Draft the PR narrative around milestone acceptance, not file inventory.
5. Link follow-up work that remains intentionally out of scope.

## Guardrails

- do not open a PR from a dirty tree
- do not hide known risks
- do not claim milestone completion without matching roadmap evidence
