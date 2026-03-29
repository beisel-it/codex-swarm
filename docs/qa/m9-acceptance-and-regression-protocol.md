# M9 Acceptance And Regression Protocol

Date: 2026-03-29
Owner: qa-engineer
Related readiness tasks:

- `69a4cc8a`
- `7b5df589`
- scenario target `15dc096b`

## Scope

This protocol defines how the team will judge the M9 landing-page scenario
without improvising the acceptance bar during execution.

Scenario under test:

- run one end-to-end development task through codex-swarm using Codex as the
  backend
- define two agents, a designer and a developer
- have them collaborate on a sample landing page
- use a fresh working directory
- do not let the leader do the implementation work directly

This is a readiness and acceptance document only. It does not dispatch or run
the scenario itself.

## Pass Conditions

The M9 run passes only if all of the following are true.

### 1. Isolation and setup

- the run uses the documented fresh working directory for the scenario
- the working directory and artifact paths are recorded in the run evidence
- the branch or workspace used for the run is free of unrelated in-flight work
  that would contaminate the result

### 2. Role fidelity

- the designer and developer roles are instantiated from documented codex-swarm
  playbooks rather than ad hoc prompt improvisation
- the leader coordinates the run but does not perform the landing-page
  implementation work directly
- the handoff boundary between design output and implementation output is
  visible in the recorded artifacts

### 3. Workflow completion

- the scenario produces a real codex-swarm run with visible task progression
- the run includes at least one explicit design-output checkpoint and one
  implementation-output checkpoint
- the scenario ends with a reviewable landing-page result rather than only task
  metadata or plan text

### 4. Evidence completeness

- required artifacts, validation outputs, screenshots, and checkpoints are all
  captured
- the team can reconstruct what happened from checked-in or exported evidence
  without relying on memory or hidden operator steps

### 5. Regression discipline

- any failure is classified using the rules below before the run is declared a
  product regression
- the final report distinguishes platform defects from scenario-definition
  issues and from unrelated branch churn

## Required Evidence

The M9 run should not be judged complete unless all of these are collected.

### Operator and run evidence

- task ID and run ID used for the scenario
- recorded working directory path
- documented role definitions used for the designer and developer
- board or task-state snapshots showing progression through the scenario

### Artifact evidence

- design artifact or design-oriented checkpoint produced by the designer
- implementation artifact or landing-page output produced by the developer
- any plan, validation, or handoff artifacts generated during the run

### Verification evidence

- validation commands run against the landing-page workspace
- final review checkpoint showing whether the scenario is accepted or rejected
- screenshots of the produced landing page and any relevant review surface if a
  browser UI is involved

### Branch-stability evidence

- `corepack pnpm ci:typecheck`
- `corepack pnpm ci:test`
- `corepack pnpm ci:build`
- note of any unrelated failures or churn present before the scenario starts

## Failure Classification Rules

Every failure must be classified into one of these buckets before escalation.

### A. Product regression

Classify as a product regression when:

- codex-swarm fails to create, coordinate, persist, recover, or review the run
  according to documented behavior
- the designer/developer handoff cannot be completed because a shipped control
  surface is missing or broken
- the run violates the explicit “leader does not implement” rule because the
  system cannot support the delegated workflow as designed
- required state, artifacts, validations, or review checkpoints are lost or
  inconsistent due to platform behavior

Expected response:

- record concrete file, route, runtime, or UI evidence
- open or update a backlog item
- do not wave the failure away as operator error unless the protocol was
  clearly not followed

### B. Scenario-definition problem

Classify as a scenario-definition problem when:

- the designer/developer playbooks are ambiguous or incomplete
- the expected artifacts or checkpoints were not specified clearly enough
- the runbook for the fresh working directory or setup path is missing steps
- the acceptance bar cannot be applied because the scenario definition itself
  leaves critical behavior undefined

Expected response:

- tighten the scenario docs or playbooks before rerunning
- do not classify as a platform regression unless the product also failed

### C. Operator mistake

Classify as operator mistake when:

- the documented runbook was not followed
- the wrong branch, task, or workspace was used
- destructive commands were issued despite protocol guardrails
- the leader or an operator performed implementation work directly despite the
  explicit rule against it

Expected response:

- record the protocol deviation
- rerun only after the operator path is corrected
- do not file a product regression unless the product also behaved incorrectly

### D. Unrelated branch churn

Classify as unrelated branch churn when:

- the branch is not stable before the scenario starts
- CI-equivalent checks fail for reasons unrelated to the M9 scenario slice
- unrelated in-flight work contaminates the working directory, runtime, or
  generated evidence

Expected response:

- block the M9 run until the branch is restabilized or isolated
- attribute the blocker to the owning lane with concrete evidence

## Review Checkpoints During M9

When the scenario is eventually run, QA should insist on these checkpoints:

1. Pre-run readiness checkpoint:
   branch stability, workspace isolation path, and role definitions confirmed
2. Design handoff checkpoint:
   designer output exists and is reviewable before developer implementation
3. Implementation checkpoint:
   developer output is present in the isolated working directory
4. Validation checkpoint:
   required checks run against the produced landing-page workspace
5. Final review checkpoint:
   pass or fail called with explicit failure classification if rejected

## Immediate Readiness Use

This protocol is the acceptance source for readiness task `7b5df589`.

M9 should not start until:

- the branch-stability task `69a4cc8a` is complete
- the isolated workspace procedure exists
- the designer/developer playbook exists
- this acceptance and regression protocol is adopted for the run
