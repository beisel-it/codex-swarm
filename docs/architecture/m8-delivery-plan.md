# M8 Delivery Plan

## Scope Reference

This plan implements backlog item `1823fdc3`:

`M8 - add a comprehensive skill library (codex compatible) to be able for codex to drive and manage codex-swarm from the outside, diagnose problems, run workflows and tasks, define new agents and do everything a user can`

The goal is not "more skills" in the abstract. The goal is a complete
codex-swarm-specific external operator skill pack that lets Codex manage Codex
Swarm through the same product and repository surfaces that a strong human
operator would use.

## Objective

Ship a Codex-compatible skill library and supporting docs so an external Codex
session can:

- inspect board, inbox, and run state
- create and manage tasks
- coordinate agents and team loops
- diagnose workflow failures and recovery state
- drive normal run workflows from planning through review
- define or extend agents and skills safely

## Deliverables

1. Operator skill set for:
   - board and inbox inspection
   - task creation, dependency management, and reassignment
   - run lifecycle and review workflow control
   - recovery and diagnostics
   - skill and agent authoring/extension
2. Repo-facing entry docs that explain how external Codex should use the skill
   pack against this workspace.
3. Example workflows proving the skills can drive:
   - a triage pass
   - a task-board planning pass
   - an execution monitoring pass
   - a recovery/diagnostic pass
4. Acceptance package showing the library is coherent and usable, not just
   present as disconnected files.

## Definition Of Done

M8 is complete when all of the following are true:

1. A Codex operator can discover the skill library from checked-in docs and
   config without repo-specific tribal knowledge.
2. The library includes explicit skills for:
   - board triage
   - task DAG creation and maintenance
   - agent coordination and loop management
   - run diagnostics and recovery investigation
   - skill/agent extension workflows
3. Each skill has:
   - purpose
   - trigger conditions
   - required inputs
   - concrete codex-swarm workflow steps and commands
   - expected outputs
4. At least three end-to-end example workflows are documented and exercised
   against the repo's real coordination model.
5. QA can verify that an external Codex operator could manage Codex Swarm using
   the checked-in skill pack without relying on hidden prompt lore.

## Execution Tracks

### Track 1: Operator skill coverage

Owner: backend-dev

Deliver:

- board/inbox/task-control skills
- run diagnostics/recovery skill
- workflow-management skill surfaces mapped to real codex-swarm operating flows,
  using `clawteam` only where it is one underlying control surface

Primary acceptance:

- every major external operator workflow has a matching checked-in skill

### Track 2: Agent and skill authoring pack

Owner: tech-lead

Deliver:

- codex-swarm-specific guidance for creating agents and extending skills
- updated top-level guidance connecting `.codex/agents`, `.agents/skills`, and
  workspace conventions

Primary acceptance:

- agent/skill extension is documented as a repeatable workflow, not an implicit
  repo convention

### Track 3: Documentation and examples

Owner: frontend-dev

Deliver:

- operator-facing examples and walkthroughs
- screenshot or artifact-backed examples where visual context helps

Primary acceptance:

- an external operator can see what successful control flows look like

### Track 4: Verification and coherence

Owner: qa-engineer

Deliver:

- acceptance pass over the skill library
- gap report if any operator-critical workflow is still unsupported

Primary acceptance:

- the skill pack is verified as coherent, discoverable, and operationally
  useful

## Initial M8 Backlog Shape

1. Create board/inbox/task-control skills.
2. Create run diagnostics and recovery skills.
3. Create agent/skill authoring and extension skills.
4. Add operator-facing examples and walkthrough docs.
5. QA acceptance pass over the full external-operator skill library.

## Risks

- Writing generic skills instead of codex-swarm-specific workflows will produce
  noise, not capability.
- If examples are not grounded in real codex-swarm operations, the library will
  look complete but remain unusable.
- If the verification pass does not test discoverability, the pack may still
  depend on hidden team knowledge.
