# M3 Delivery Plan

## Scope Reference

This plan implements `ROADMAP.md` Phase 3, `v0.2: hardening and developer workflow integration`.

Phase 3 objectives:

- real repo onboarding and Git provider integration
- branch publish and pull request handoff
- curated role packs and skills
- repo profile templates
- governance-lite controls
- quality hardening for repeated internal use

## Exit Criteria

Phase 3 is complete when:

1. A user can start from a GitHub or GitLab repo and end with a PR.
2. Budget caps and concurrency caps are enforced during real runs.
3. Curated skills, role packs, and repo templates are shipped, documented, and
   usable as starter packs for repeatable Codex Swarm workflows.

## Execution Order

### Track 1: Git provider path

Owner: backend-dev

Primary task:

- `de54a793` Deliver M3 Git provider onboarding, branch publish, and PR handoff

Expected outputs:

- repo onboarding flow for GitHub/GitLab
- branch publish support
- pull request creation support
- PR status reflection hooks into board data surfaces

This is the critical path for the main Phase 3 exit criterion.

### Track 2: Productivity packs

Owner: tech-lead

Primary task:

- `82c94ee4` Deliver M3 curated role packs, skills, and repo templates

Expected outputs:

- curated `.codex/agents/` role pack
- initial reusable skills:
  - `plan-from-spec`
  - `create-task-dag`
  - `validate-milestone`
  - `prepare-pr`
- repo profile templates by stack

This track reduces setup friction and supports repeatability.

### Track 3: Governance-lite

Owner: backend-dev

Primary task:

- `07c85e9d` Deliver M3 governance-lite: budgets, concurrency caps, approval profiles, audit export

Expected outputs:

- budget caps
- concurrency caps
- approval profiles by repo
- basic audit log export

This track should integrate with the existing control-plane model instead of bolting on a separate config path.

### Track 4: Quality hardening

Owner: qa-engineer

Primary task:

- `a6b55c18` Deliver M3 quality hardening: load tests, retry semantics, cleanup jobs

Expected outputs:

- load and soak coverage
- retry semantics validation with backend/devops
- cleanup-job verification for stale worktrees and sessions

This is the validation gate for M3 readiness rather than the first implementation step.

### Supporting UI follow-up

Owner: frontend-dev

Needed to fully realize Track 1:

- board and run-detail surfaces should reflect repo onboarding state, publish state, and PR status
- review surfaces should show PR links/status once backend provider integration lands

## Dependency Model

Phase 3 refinement is complete once this plan is accepted and the above tracks are active.

Execution dependencies:

1. Git provider backend path and productivity packs can start in parallel.
2. Governance-lite can start in parallel with Git provider work, but budget/concurrency controls should be integrated before Phase 3 signoff.
3. QA hardening should begin once the Git provider path and governance-lite controls are materially implemented.
4. Frontend PR-status work should follow backend provider contracts.

## Risks

- Git provider scope creep can absorb the whole phase if onboarding and PR creation are not kept minimal.
- Governance-lite should not drift into full enterprise RBAC/SSO, which belongs to Phase 5.
- Quality hardening needs realistic fixtures and cleanup hooks or it becomes shallow test coverage.

## Deliberate Non-Goals

These remain outside Phase 3:

- true multi-tenant auth/RBAC
- distributed workers across hosts
- enterprise compliance exports
