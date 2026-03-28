# QA Blockers

## 2026-03-28

### Blocking issue

The task `Write unit and integration tests` cannot be executed on the current `main` branch because the repository only contains `PRD.md` and `ROADMAP.md`.

### Evidence

- no `package.json`
- no `tsconfig.json`
- no `src/` directory
- no existing tests
- no remote branches or alternate local branches with implementation code

### Impact

- no unit tests can be authored against production code
- no integration tests can exercise API, orchestration, or UI flows
- no CI verification can be added meaningfully yet

### Recommended unblock

Implement the first TypeScript vertical slice described in Phase 1 of `ROADMAP.md`, then assign QA follow-up for:

1. test harness setup
2. unit test coverage for core services
3. integration test coverage for API and worker lifecycle
4. browser smoke testing for the board UI
