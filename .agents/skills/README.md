# Codex Swarm Skill Library

This directory contains the checked-in Codex skill library for operating and
extending `codex-swarm`.

## Skill groups

### External operator skills

- `codex-swarm-board-triage`
- `codex-swarm-inbox-inspection`
- `codex-swarm-task-control`
- `codex-swarm-agent-coordination`
- `codex-swarm-diagnostics`
- `codex-swarm-recovery`

These are the M8 codex-swarm-specific skills for operating the workspace from
the outside.

### Workflow execution skills

- `plan-from-spec`
- `create-task-dag`
- `validate-milestone`
- `prepare-pr`

These are reusable execution workflows used inside repo delivery work.

## How to add a new codex-swarm skill

1. Create a new directory under `.agents/skills/<skill-name>/`.
2. Add a `SKILL.md` with:
   - purpose
   - trigger conditions
   - required inputs
   - concrete commands or workflow steps
   - expected outputs
3. Reference only real codex-swarm control surfaces:
   - `clawteam` board/inbox/task/workspace commands
   - repo docs under `docs/`
   - local verification commands such as `corepack pnpm ...`
4. Add the skill to [docs/operator-skill-library.md](../../docs/operator-skill-library.md)
   if it is part of the external operator pack.
5. Add or update an example workflow in
   [docs/operator-skill-workflows.md](../../docs/operator-skill-workflows.md)
   if the new skill changes operator guidance.

## How to evaluate whether a skill belongs here

Add the skill if it teaches Codex how to operate `codex-swarm` or a repo
managed by `codex-swarm` through concrete, repeatable workflows.

Do not add the skill if it is only:

- generic product advice
- generic ClawTeam usage unrelated to codex-swarm
- generic coding help with no codex-swarm workflow tie-in
