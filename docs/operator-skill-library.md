# Codex Swarm Skill Library

This document is the entry point for using the checked-in Codex Swarm skill
pack to operate and extend the actual product.

The pack is grounded in:

- the frontend workspaces under `Projects`, `Ad-Hoc Runs`, and `Settings`
- run workspaces under `overview`, `board`, `lifecycle`, and `review`
- the HTTP control plane exposed under `/api/v1`
- checked-in operational commands and runbooks

It is not a wrapper around another product's task board or inbox model.

## Current skill set

- [`codex-swarm-run-operations`](../.agents/skills/codex-swarm-run-operations/SKILL.md)
- [`codex-swarm-project-automation`](../.agents/skills/codex-swarm-project-automation/SKILL.md)
- [`codex-swarm-review-governance`](../.agents/skills/codex-swarm-review-governance/SKILL.md)
- [`codex-swarm-worker-lifecycle`](../.agents/skills/codex-swarm-worker-lifecycle/SKILL.md)
- [`codex-swarm-observability-diagnostics`](../.agents/skills/codex-swarm-observability-diagnostics/SKILL.md)
- [`codex-swarm-recovery-restore`](../.agents/skills/codex-swarm-recovery-restore/SKILL.md)
- [Agent and Skill Authoring Guide](./agent-skill-authoring.md)
- [Checked-in skill index](../.agents/skills/README.md)

## Selection guide

- Need to create, inspect, or advance runs:
  use `codex-swarm-run-operations`
- Need to set up projects, repositories, repeatable runs, or webhooks:
  use `codex-swarm-project-automation`
- Need to inspect approvals, validations, artifacts, handoff, or audit posture:
  use `codex-swarm-review-governance`
- Need to inspect worker nodes, dispatch state, or placement behavior:
  use `codex-swarm-worker-lifecycle`
- Need to diagnose health, metrics, events, or observability gaps:
  use `codex-swarm-observability-diagnostics`
- Need to execute cleanup, restore, DR, or upgrade-safe remediation:
  use `codex-swarm-recovery-restore`
- Need to add or revise skills:
  use `docs/agent-skill-authoring.md` and `.agents/skills/README.md`

## How to operate Codex Swarm with this pack

1. Start from the real product surface that matches the question:
   - project inventory
   - ad-hoc runs
   - run board
   - run lifecycle
   - run review
   - settings/governance
2. Confirm backend truth with the matching `/api/v1` routes before making claims
   about state transitions or failures.
3. Use project automation skills for repeatable runs and webhooks, not ad hoc
   run guidance.
4. Use observability and worker lifecycle skills to separate execution issues
   from runtime and placement issues.
5. Use recovery only after diagnostics establish that mutation is warranted.

## Core supporting docs

- [Operator Guide](./operator-guide.md)
- [Operator Skill Workflows](./operator-skill-workflows.md)
- [Support Playbooks](./support-playbooks.md)
- [Webhook-Triggered Repeatable Runs](./operations/webhook-triggered-runs.md)
- [Control-Plane API Contract](./architecture/control-plane-api-contract.md)
