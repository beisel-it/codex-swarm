# Platform / Ops Team Template

Use this template when the work is primarily about deployment, worker topology,
CI/CD, recovery, observability, or infrastructure-facing reliability.

## Team shape

- `leader`
  - owns sequencing, rollout decisions, and closure of the operational objective
- `architect`
  - defines topology and control-surface implications for deployment changes
- `infrastructure-engineer`
  - implements service packaging, CI/CD, runtime config, networking, and private exposure rules
- `backend-developer`
  - implements API, worker, or orchestration changes required by the platform goal
- `reviewer`
  - checks for rollout risk, regression risk, and operational blind spots
- `tester`
  - proves real deployment or recovery behavior
- `technical-writer`
  - updates operator docs, runbooks, and rollout guidance

## When to use this team

Use this stack for work such as:

- tailnet/private deployment bring-up
- worker fleet topology changes
- CI/CD redesign
- backup, restore, cleanup, and recovery improvements
- runtime config and service hardening

## Launch pattern

1. Start with the topology or operational goal.
2. Have `architect` and `infrastructure-engineer` define the intended shape.
3. Add `backend-developer` only where the deployment goal exposes a real product/runtime gap.
4. Keep `reviewer`, `tester`, and `technical-writer` trailing close behind implementation so deployment proof and docs do not drift.

## Minimum deliverables

- checked-in service/unit/workflow/runtime-config assets
- real reachability or execution proof on the target topology
- explicit verification commands for operators
- updated recovery or support guidance if the operational model changed

## Done criteria

- no required surface is public by accident
- stateful services bind only where intended
- the target topology can be restarted and re-entered by a fresh operator from docs
- CI or deployment gates reflect the real supported path rather than stale jobs
