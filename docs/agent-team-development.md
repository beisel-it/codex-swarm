# Agent Team Development Guide

This guide explains how to design effective agent teams for codex-swarm-style
delivery work.

It sits between:

- [Agent and Skill Authoring Guide](./agent-skill-authoring.md), which explains
  how to write agents and skills
- [Development Team Template](../templates/agent-teams/development-stack.md),
  [Platform / Ops Team Template](../templates/agent-teams/platform-ops-stack.md),
  and [Web Design Studio Team Template](../templates/agent-teams/web-design-studio.md),
  which provide ready-made team shapes
- [Operator Guide](./operator-guide.md), which explains how to use the checked-in
  pack in the current repo

Use this guide when you need to:

- decide whether a task should stay single-agent or become multi-agent
- shape a new team template
- improve an existing team template based on repeated delivery failures
- explain why a given role belongs in a team at all

Non-goal:
this guide does not itself change the checked-in templates. It explains the
method that should be used to judge and improve them.

## Core Thesis

Good agent teams are not built by copying human job titles. They are built by
separating the parts of the work that most often fail when one agent tries to
do everything at once:

- decision boundaries
- context boundaries
- tool boundaries
- verification boundaries

The best team is usually the smallest team that can:

- make the necessary decisions without ambiguity
- execute independent work in parallel where that really helps
- prove correctness with independent review and verification
- leave enough artifacts that a fresh operator can understand what happened

If a single agent plus skills can do that cleanly, do not add more agents.

## Autonomy Posture

Codex Swarm is intentionally experimenting with high degrees of agent autonomy.
This guide assumes that default human permission gates are low or absent for
ordinary delivery work.

That means this document does not recommend generic conservative defaults such
as:

- waiting for a human to approve every code change
- routing every ambiguous implementation detail back to the operator
- slowing normal execution with blanket confirmation steps

Those defaults are the opposite of the posture this repo is trying to test.

The warning is different:
if you reduce approval gates, team design must carry more of the control load.
In this repo, the primary control mechanisms should be:

- narrow role boundaries
- clear task ownership
- explicit handoff artifacts
- independent review and testing roles where the risk justifies them
- concrete done criteria tied to runnable evidence

Low-guardrail autonomy increases the chance of:

- fast but wrong changes
- duplicated work from overlapping ownership
- correlated mistakes when builders also judge their own output
- silent drift between code, runtime behavior, and docs
- larger blast radius when a role has vague scope or too much write access

The answer is not "add more human approval by default." The answer is to design
teams so autonomy remains bounded by structure, not by constant operator
interruption.

## Start Simple

Default to a single agent with skills when:

- the task is narrow and mostly sequential
- the same context is needed across all steps
- there is little benefit from parallelism
- review can happen after the fact without a separate runtime role

Add more agents only when at least one of these becomes true:

- one agent is overloaded with too many tools or too many instructions
- the task naturally splits into independent workstreams
- one part of the work needs durable specialist context
- the slice needs independent review, testing, or documentation before closure
- latency matters and parallel execution is genuinely available

This matches the practical guidance from OpenAI's agent guide to maximize a
single agent first and split only when complexity or tool overload makes that
necessary, and from LangChain's multi-agent guidance to treat context
engineering as the center of multi-agent design. Anthropic's production notes
point in the same direction: multi-agent systems work best when the work is
actually parallelizable, the orchestrator is taught how to delegate, and the
extra cost is justified by the task value.

## Single Agent Vs Skill Vs Team

Use this decision table before creating or extending a team template.

| Situation | Preferred shape | Why |
| --- | --- | --- |
| Narrow vertical slice with one clear owner | Single agent | Lowest coordination cost |
| Same owner, but repeated domain workflow | Single agent + skills | Reuse workflow without a new role |
| Shared-contract change across backend and frontend | Multi-agent team | Boundary stabilization and parallel delivery matter |
| Product slice with UX, API, and acceptance work | Multi-agent team | Different contexts and proof surfaces need separate owners |
| Deployment, CI/CD, recovery, or topology change | Multi-agent team | Operational risk needs specialist implementation and proof |
| Mostly coupled work with little real parallelism | Single agent or very small team | Extra agents will create handoff overhead without benefit |

## Team Design Principles

### 1. Split by durable ownership, not by busywork

A role should exist because it owns a decision surface or a verification surface
that should remain stable across many tasks.

Good examples:

- `architect` owns system boundaries and shared contracts
- `backend-developer` owns runtime behavior and persistence
- `reviewer` owns defect-focused scrutiny
- `tester` owns repeatable evidence

Bad examples:

- creating one role just because one task is large
- creating a new role for a single command or one-off workflow variation
- splitting one tightly coupled change across multiple implementers with shared
  write scope

If the variation is mostly workflow and not durable ownership, make a skill,
not a new agent.

### 2. Separate builders from provers

Implementation roles should not be the only source of confidence that the work
is correct. Good teams keep independent closure roles close to the implementation:

- `reviewer` checks for defects, regressions, and drift
- `tester` proves behavior with repeatable checks
- `technical-writer` turns shipped behavior into operator-ready guidance

This is especially important in codex-swarm because "done" depends on shipped
behavior, verification evidence, and operator docs staying aligned.

### 3. Give one role sequencing authority

A team without a clear coordinator usually accumulates duplicated work,
unclear ordering, or unfinished closure steps. In the checked-in role pack,
`leader` exists to:

- translate the active spec into execution order
- keep dependencies coherent
- decide when the milestone evidence is sufficient for closure

Without a single sequencing owner, multi-agent work degrades into a set of
loosely related tasks rather than a controlled slice.

### 4. Add specialists only for real failure modes

A specialist role is justified when repeated work shows that a generic
implementer or lead is missing something important.

Examples:

- add `designer` when layout quality, IA, states, and screenshot acceptance
  materially affect success
- add `infrastructure-engineer` when deployment, runtime topology, CI/CD, or
  private exposure rules become first-class concerns
- use `technical-writer` when operator workflows or rollout guidance change

Do not add a specialist because the work "sounds serious." Add one because the
absence of that specialist causes repeated defects, ambiguity, or drift.

### 5. Optimize for clean handoffs

Every role should receive:

- a clear objective
- the relevant input context
- a bounded scope
- explicit output expectations
- a concrete done signal

If handoffs are vague, teams duplicate work, miss edges, and produce artifacts
that cannot be reviewed efficiently.

## The Checked-In Role Pack, Explained

The current role pack in [`.codex/agents/`](/home/florian/codex-swarm/.codex/agents)
is shaped around durable delivery boundaries, not generic org-chart labels.

### Coordination

- `leader`
  - owns sequencing, dependency management, and milestone acceptance
- `architect`
  - stabilizes contracts and boundary decisions before implementation fans out

These roles reduce ambiguity before code splits across multiple surfaces.

### Implementation

- `design-researcher`
  - owns topic understanding, audience framing, and reference gathering before design-led implementation starts
- `art-director`
  - owns visual thesis, art direction, typography direction, palette, and motion intent for design-led web work
- `design-engineer`
  - owns production implementation of design-led web experiences where rendered output quality is a first-class requirement
- `backend-developer`
  - owns API, orchestration, runtime, persistence, and end-to-end execution behavior
- `frontend-developer`
  - owns operator-facing UI behavior and screenshot-verified delivery
- `infrastructure-engineer`
  - owns deployment topology, CI/CD, runtime config, and operational reliability
- `implementer`
  - provides a smaller, faster implementation role when a full specialist spread
    would be excessive

These roles exist because topic research, art direction, design-heavy
implementation, backend, frontend, and platform work each carry different
context, tools, and failure modes.

### Product Definition And Closure

- `designer`
  - exists when interaction structure and rendered quality need first-class ownership
- `visual-reviewer`
  - exists when screenshot-first aesthetic critique is a separate proof surface from code review
- `reviewer`
  - provides defect-focused independent scrutiny
- `tester`
  - turns acceptance criteria into repeatable proof
- `technical-writer`
  - keeps shipped behavior, operator docs, and rollout guidance aligned

These roles prevent the common failure mode where the feature "works in code"
but is not actually ready to operate, review, or support.

## Team Composition Workflow

Use this sequence when designing a team or updating a template.

### 1. Start from the shipped outcome

Define what must be true at the end:

- what behavior is shipped
- which surfaces changed
- what evidence proves success
- what docs or operator flows must stay aligned

If the desired outcome is vague, team design will also be vague.

### 2. Identify the decision surfaces

List the places where durable judgment is needed:

- architecture or contracts
- topic, audience, or reference landscape
- user experience or interaction model
- runtime or persistence behavior
- deployment and topology
- review, test, and documentation closure

Each durable decision surface is a candidate ownership boundary.

### 3. Identify real parallelism

Split only where the work can proceed independently or with a clear handshake.

Good parallel splits:

- backend contract implementation and designer IA/state work
- infrastructure packaging and backend runtime changes with an agreed interface
- documentation prep trailing a stabilized implementation

Bad parallel splits:

- two agents editing the same logic in the same files
- multiple implementers sharing one vague objective
- spinning up specialists before architecture or scope is settled

### 4. Identify required independent proof

Ask what must be independently verified before the slice can close:

- runtime correctness
- regression risk
- end-to-end acceptance
- screenshot or visual quality
- operator guidance and runbook updates

If the answer includes more than one proof surface, plan explicit closure roles.

### 5. Choose the smallest viable team

Build from the minimum set of owners needed to cover the work:

- for a small vertical slice: `leader` + `implementer`, then add `reviewer` or
  `tester` if the risk justifies it
- for a contract-heavy product slice: `leader` + `architect` + implementation
  roles + closure roles
- for operational work: `leader` + `architect` + `infrastructure-engineer` + any
  required product/runtime support roles

Template sprawl is a smell. If every task starts with a maximal team, the
template is doing scheduling theater instead of helping delivery.

### 6. Define launch order and handoffs before execution

Before the team starts, define:

- which role goes first
- what each downstream role is waiting on
- which artifacts each role must produce
- which command outputs, screenshots, or docs close the slice

This matters as much as team membership. A correct team with a poor launch order
still performs badly.

## Standard Team Shapes

### Small Vertical Slice

Use:

- `leader`
- `implementer`
- optionally `reviewer` or `tester`

Use this when the work is narrow, mostly sequential, and does not justify
splitting backend, frontend, or platform concerns into separate specialists.

### Product Delivery Slice

Use:

- `leader`
- `architect` when contracts or boundaries change
- `designer` when UX structure matters
- `backend-developer`
- `frontend-developer`
- `reviewer`
- `tester`
- `technical-writer` when behavior changes operators must understand

This is the logic behind the checked-in
[Development Team Template](../templates/agent-teams/development-stack.md).

### Studio / Web Design Slice

Use:

- `leader`
- `design-researcher`
- `art-director`
- `design-engineer`
- `visual-reviewer`
- `tester`
- `frontend-developer` only when the work must integrate with real app state or APIs
- `reviewer` only when code or integration risk is material
- `technical-writer` when client handoff or rollout guidance is part of the deliverable

Use this shape when the dominant risk is not contract ambiguity or topology
change, but generic design convergence, weak visual direction, poor
topic-grounding, and weak browser-level polish. This is the logic behind the checked-in
[Web Design Studio Team Template](../templates/agent-teams/web-design-studio.md).

### Platform / Ops Slice

Use:

- `leader`
- `architect`
- `infrastructure-engineer`
- `backend-developer` only where runtime or API changes are part of the solution
- `reviewer`
- `tester`
- `technical-writer`

This is the logic behind the checked-in
[Platform / Ops Team Template](../templates/agent-teams/platform-ops-stack.md).

## Delegation And Handoff Rules

Good agent teams are usually distinguished less by the names of their roles than
by the quality of the work orders passed between them.

Every delegated task should include:

- the exact objective
- why this role owns it
- files or surfaces in scope
- files or surfaces out of scope when overlap risk exists
- required outputs
- verification expectations
- what should trigger escalation instead of improvisation

Escalation here should mean boundary conflict, missing prerequisite context, or
evidence of a broader delivery problem. It should not mean asking for human
permission on routine implementation steps that already fit the assigned scope.

For parallel workers, prefer one of two shapes:

- disjoint write scopes
- explicit producer/consumer order with a known handshake

Examples of useful handoff artifacts:

- contract notes from `architect`
- topic research and reference pack from `design-researcher`
- state/IA spec from `designer`
- concrete implementation diff from `backend-developer` or `frontend-developer`
- findings from `reviewer`
- runnable evidence from `tester`
- operator-facing runbook updates from `technical-writer`

For design-heavy teams, image artifacts are part of the handoff surface too.
If a role generates, exports, or inspects visual assets, it should use
`view_image` freely rather than relying on textual assumptions about what the
asset looks like.

## Common Failure Modes

### Too many agents

Symptoms:

- little real parallelism
- repeated synchronization overhead
- superficial ownership labels with no real boundaries

Fix:
collapse back to a smaller team or a single agent with skills.

### Overlapping ownership

Symptoms:

- multiple agents editing the same surfaces
- duplicate analysis
- conflicting conclusions with no clear decider

Fix:
restate ownership around one role per durable boundary.

### Review and test added too late

Symptoms:

- reviewer findings force large rework
- tester discovers basic acceptance gaps after the team already claimed closure
- docs lag behind shipped behavior

Fix:
pull closure roles closer to implementation and define evidence up front.

### Template cargo culting

Symptoms:

- the team is chosen because "that is the standard stack"
- specialists are added even when their decision surface is absent
- the same template is used for product work and platform work without adjustment

Fix:
compose from the outcome and risk profile first, then justify each role.

### Weak delegation from the orchestrator

Symptoms:

- subagents duplicate work
- important edges go uncovered
- specialists improvise their own problem statement

Fix:
teach the lead role to delegate with explicit boundaries, outputs, and scaling
rules.

## How To Improve Templates From Evidence

Do not rewrite team templates because one run felt awkward. Change them when the
same failure mode appears repeatedly.

Good evidence for a template change:

- the same blocker appears across multiple runs
- one role is consistently overloaded
- ad hoc specialist roles keep being invented for the same kind of work
- reviewer/tester/docs repeatedly discover the same missing closure step
- teams keep shipping work that passes code review but fails operationally

When that happens:

1. identify the repeated failure mode
2. decide whether it is a role problem, a skill problem, or a launch-order problem
3. update the smallest artifact that fixes it
4. keep the change additive so downstream forks can adopt it cleanly

Often the right fix is not "add another agent." It may be:

- sharpen the existing role instructions
- add a skill
- change the launch pattern
- make proof requirements explicit earlier

## Worked Examples

### Why the development template exists

The [Development Team Template](../templates/agent-teams/development-stack.md)
exists for slices where product behavior spans UI, API, contracts, and
verification. It includes:

- `architect` because shared-shape ambiguity multiplies downstream rework
- `designer` because information architecture and screenshot quality matter
- `backend-developer` and `frontend-developer` because those contexts are large
  and parallelizable
- `reviewer`, `tester`, and `technical-writer` because product slices are not
  done at code completion

Remove roles from this template only when the surface is absent. For example, if
there is no operator-visible UX change, `designer` may not be required for a
specific run even if the template is the right starting point.

### Why the platform template exists

The [Platform / Ops Team Template](../templates/agent-teams/platform-ops-stack.md)
exists for slices where the dominant risk is operational rather than UI-facing.
It includes:

- `infrastructure-engineer` as a first-class owner because topology, exposure,
  and CI/CD behavior are the main problem
- `backend-developer` only where runtime or API changes are genuinely needed
- the same closure roles because operational changes still need proof and docs

This template should stay lean on product-facing specialists unless the platform
goal exposes a real user-facing gap.

### Why the web design studio template exists

The [Web Design Studio Team Template](../templates/agent-teams/web-design-studio.md)
exists for work where the main failure mode is not backend correctness or ops
topology, but design flattening:

- the team starts styling before it understands the topic, audience, or institution
- the visual direction collapses into generic SaaS patterns
- implementation silently redesigns the concept while coding
- visual review happens too late to recover hierarchy, motion, or atmosphere
- the team validates code and responsiveness but never validates distinctiveness

It includes:

- `design-researcher` because topic understanding and reference collection are a
  separate durable ownership surface from visual direction
- `art-director` because creative direction and implementation are different
  durable ownership surfaces
- `design-engineer` because visual ambition still needs production-grade code
- `visual-reviewer` because aesthetic quality is a real proof surface, not an
  optional polish pass
- `tester` because beautiful web work still has to survive browsers, breakpoints,
  and real interaction states

This template stays additive on purpose. The existing `designer` and
`frontend-developer` roles are optimized for codex-swarm's operator-facing
product surfaces, which value compactness and operational clarity. For a
design-led studio website, those instructions would create the wrong defaults.

When the studio brief is genuinely small, the research boundary can be collapsed
into `art-director`, but that collapse should be explicit and the team should
still produce a research pack before art direction starts. The point is not to
maximize headcount; it is to make sure no one designs from an empty prompt.

Image generation and browser automation should remain skills or tools attached
to the relevant roles, not new durable roles. `nano-banana-pro` helps sharpen
art direction; `Agent Browser` helps verify it. Neither owns a stable decision
surface on its own.

## External Notes

These external references support the design approach used here:

- OpenAI, [A practical guide to building agents](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf)
  - start with the simplest viable orchestration and split only when complexity
    demands it
- Anthropic, [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)
  - multi-agent systems need explicit delegation, scaling rules, and clear
    subtask boundaries
- Anthropic, [Prompting for frontend aesthetics](https://github.com/anthropics/claude-cookbooks/blob/main/coding/prompting_for_frontend_aesthetics.ipynb)
  - design-heavy frontend work needs explicit anti-generic aesthetic pressure on
    typography, palette, motion, and backgrounds
- LangChain, [Multi-agent](https://docs.langchain.com/oss/javascript/langchain/multi-agent)
  - context engineering and pattern choice should drive architecture decisions

The important point is not to copy any one framework. It is to apply the same
operational logic inside codex-swarm:

- keep context scoped
- keep roles explicit
- keep delegation concrete
- keep proof separate from implementation
- keep teams no larger than the task justifies
