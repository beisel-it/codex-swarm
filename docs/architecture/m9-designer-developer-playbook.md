# M9 Designer And Developer Playbook

This playbook is the frontend-owned readiness deliverable for task `9c4c0e10`.

It prepares task `15dc096b` without starting the M9 scenario run itself.

Source-of-truth pairing:

- [docs/architecture/m9-readiness-plan.md](/home/florian/codex-swarm/docs/architecture/m9-readiness-plan.md)
- [docs/operator-guide.md](/home/florian/codex-swarm/docs/operator-guide.md)

## Scope

The M9 scenario is intentionally narrow:

- one fresh working directory
- one sample landing page
- two active implementation agents only:
  - `Designer`
  - `Frontend Developer`

The leader or external operator may coordinate the run, but must not do the
landing-page design or implementation work directly.

## Preconditions

Do not start the M9 scenario from this playbook alone. The following readiness
inputs must already exist:

1. Shared-branch verification from QA.
2. Fresh-workdir and isolation procedure from devops.
3. QA acceptance and regression checklist for the scenario run.
4. Explicit go/no-go from tech-lead.

This playbook only defines the two-agent operating shape once those other gates
have landed.

## Agent Roles

Use the repo's actual role vocabulary, not improvised labels.

### Designer

Mission:

- define the landing-page concept, hierarchy, content framing, and visual
  direction
- produce implementation-ready guidance for the developer
- keep the aesthetic direction intentional enough that the developer is not
  forced to invent the design while coding

The designer owns:

- page goal and audience framing
- information architecture
- section order
- headline and support copy direction
- visual system: palette, typography direction, spacing rhythm, tone
- component inventory for the landing page
- mobile and desktop layout intent
- handoff notes describing what is fixed versus flexible

The designer does not own:

- production React/Vite implementation
- final responsive bug fixing in code
- build or lint verification
- implementation-side dependency choices

### Frontend Developer

Mission:

- implement the landing page in the fresh M9 working directory using the
  designer handoff as the source of truth
- preserve design intent while shipping working code
- leave verification evidence that the page is real, responsive, and
  reviewable

The frontend developer owns:

- app or page implementation
- client-side interactions and responsive behavior
- asset integration in code
- browser verification
- build, lint, and typecheck evidence
- implementation notes and any deviation report

The frontend developer does not own:

- redefining the visual direction from scratch
- silently discarding the design handoff
- skipping verification because the page "looks done"

## Handoff Boundary

The boundary between the two agents must stay explicit.

Designer handoff ends when all of the following exist:

- a written page brief
- a section-by-section structure
- copy direction for each major section
- a visual-system note covering typography, color, spacing, and interaction
  tone
- explicit implementation constraints
- explicit open questions, if any

Developer work begins only after that handoff is recorded.

The developer may ask for clarification or propose a change, but may not treat
missing design direction as permission to redesign the page silently.

If the developer believes the handoff is incomplete, the correct action is:

1. record the gap
2. send it back to the designer or operator
3. wait for clarification before claiming implementation completion

## Required Artifacts

The M9 scenario should require these artifacts up front.

### Designer artifacts

Store these in the fresh working directory created for M9:

- `design-brief.md`
  - audience
  - page goal
  - success signal
  - visual direction
- `design-handoff.md`
  - section order
  - per-section content intent
  - component inventory
  - fixed vs flexible decisions
- one visual reference artifact
  - screenshot, mock, or equivalent image evidence
- optional asset manifest if external images, icons, or copy blocks are needed

### Developer artifacts

- implemented landing-page code in the fresh working directory
- verification output for:
  - `lint`
  - `typecheck`
  - `build`
- screenshot evidence for desktop and mobile states
- `implementation-notes.md`
  - what matched the handoff
  - what changed
  - why any deviation was necessary

### Run-level evidence

- task graph showing designer work preceding developer work
- inbox or task messages that capture clarification loops
- review or validation record showing the operator did not accept an unverified
  page

## Operator Instantiation Procedure

This is the codex-swarm-specific operator path. It is intentionally explicit so
the M9 scenario does not depend on hidden prompt lore.

1. Create the fresh working directory using the devops-owned M9 isolation
   procedure.
2. Start or prepare the M9 run without implementing the page directly.
3. Create two concrete tasks, one for each role:

   ```bash
   clawteam task create codex-swarm "M9 landing page design handoff" \
     --description "Designer defines the landing-page concept, structure, visual system, and implementation-ready handoff for the fresh M9 workdir." \
     --owner designer

   clawteam task create codex-swarm "M9 landing page implementation" \
     --description "Frontend developer implements the landing page in the fresh M9 workdir from the checked-in design handoff and leaves validation evidence." \
     --owner frontend-dev
   ```

4. Add the dependency edge so implementation cannot start cleanly before design
   handoff:

   ```bash
   clawteam task update codex-swarm <developer-task-id> --add-blocked-by <designer-task-id>
   ```

5. Message each agent with role-specific scope instead of one blended brief.
6. Keep the operator in coordination mode:
   - board inspection
   - inbox inspection
   - task control
   - checkpointing
   - regression reporting
7. Do not let the operator or leader perform the landing-page design or coding
   work.

## Expected Run Shape

The M9 run should look like this:

1. Designer receives the page goal and fresh-workdir boundary.
2. Designer produces `design-brief.md`, `design-handoff.md`, and visual
   reference evidence.
3. Operator verifies that the handoff is concrete enough for implementation.
4. Developer receives only the design handoff plus the implementation task.
5. Developer implements the page in the fresh working directory.
6. Developer produces verification output and screenshots.
7. Operator or reviewer checks the output against the original handoff and QA
   checklist.

If those stages blur together, the scenario should be treated as contaminated.

## Failure And Regression Rules

Raise a regression or scenario failure if any of the following happens:

- the leader or operator writes the landing-page code directly
- the designer handoff is too vague to implement without guessing
- the developer changes major layout, hierarchy, or visual direction without
  recording the deviation
- the run uses the shared repo root instead of the fresh M9 working directory
- verification evidence is missing
- screenshots are missing for at least desktop and mobile
- the task DAG does not show design before implementation
- the final output cannot distinguish product issues from operator mistakes

## Practical Review Questions

Use these questions during the eventual M9 run review:

- Was the designer handoff concrete before implementation started?
- Did the developer build from the handoff instead of improvising a new design?
- Did the operator stay in orchestration mode?
- Is the landing page isolated from unrelated branch churn?
- Do the screenshots and validation outputs prove the page is real?
- If the run failed, is the failure attributable to platform behavior, scenario
  definition, or operator misuse?

## What This Playbook Does Not Do

- define the devops fresh-workdir procedure
- define QA pass/fail criteria
- authorize the M9 run to start
- replace the external operator docs

Those remain owned by the other readiness tasks in
[docs/architecture/m9-readiness-plan.md](/home/florian/codex-swarm/docs/architecture/m9-readiness-plan.md).
