# M9 Readiness Plan

## Goal

Prepare the repo and team to run task `15dc096b` safely:

`Run one end to end development task through the new system using codex as the backend. define two agents a designer and a developer and have them work together to create a sample landing page (in a new working directory). YOU ARE NOT ALLOWED TO DO THE WORK YOURSELF And have to bring up any issues as potential regressions`

This is not the M9 execution plan itself. It is the gate that decides whether
M9 can be started without mixing the test run with unrelated branch churn or
undocumented operator behavior.

## M9 Readiness Definition Of Done

M9 is ready to start only when all of the following are true:

1. The shared branch is stable.
   - workspace `ci:typecheck`, `ci:test`, and `ci:build` are green
   - no unrelated in-flight work is expected to contaminate the M9 run
2. The operator path is explicit.
   - the repo contains a checked-in runbook for the M9 exercise
   - the runbook defines how to create the new working directory, start the
     run, and keep the leader from doing the implementation directly
3. The agent shape is explicit.
   - the designer and developer roles for M9 are documented
   - their handoff boundary and expected artifacts are defined before the run
4. The evidence model is explicit.
   - required artifacts, validations, screenshots, and review checkpoints are
     listed up front
   - failure and regression handling rules are written down before execution
5. QA has a release-style acceptance checklist for the M9 run.
   - pass/fail conditions are documented
   - the checklist distinguishes product regressions from operator mistakes

## Required Pre-M9 Tasks

### 1. Shared branch stabilization

Owner: qa-engineer

Deliver:

- a current workspace verification pass on the branch intended for M9
- a note of any unrelated failing areas that would contaminate the exercise

Done when:

- the branch is declared clean enough for a scenario run
- or explicit blockers are documented with owner and evidence

### 2. Isolated run environment and workdir procedure

Owner: devops

Deliver:

- the procedure for creating the fresh M9 working directory
- the procedure for isolating the run from unrelated repo churn
- the artifact and runtime paths that will be used during the exercise

Done when:

- an operator can create the M9 workspace and know which environment variables,
  commands, and directories are in scope

### 3. Designer and developer playbook

Owner: frontend-dev

Deliver:

- a codex-swarm-specific playbook for the two M9 agents
- the designer/developer boundary
- expected handoffs between design output and implementation output

Done when:

- the roles are concrete enough that an external operator can instantiate them
  without hidden prompt lore

### 4. Scenario acceptance and regression protocol

Owner: qa-engineer

Deliver:

- an M9 acceptance checklist
- a regression protocol for deciding whether a failure is due to the platform,
  the scenario definition, or unrelated branch churn

Done when:

- the run can be judged pass/fail without ad hoc criteria

### 5. Readiness review and go/no-go

Owner: tech-lead

Deliver:

- a readiness review using the four tasks above
- an explicit go/no-go call before `15dc096b` is dispatched

Done when:

- the team has recorded readiness assertions and the branch is either approved
  for M9 or held back with named blockers

## Non-Goals

- running the landing-page exercise itself
- letting the leader perform the implementation work
- treating undocumented operator behavior as acceptable because the team "knows
  how it works"
