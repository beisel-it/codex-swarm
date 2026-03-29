# TUI Launch and Capture

This runbook covers the operator-facing launch path, environment assumptions,
and capture workflow for the codex-swarm terminal UI.

Source of truth:

- `docs/architecture/post-m10-tui-delivery-plan.md`
- `docs/architecture/post-m10-tui-visual-spec.md`
- `docs/qa/post-m10-tui-acceptance-matrix.md`

## 1. Launch command

Use the stable root command:

```bash
corepack pnpm tui
```

This command launches `apps/tui` through the repo-level wrapper so startup
failures produce operator guidance instead of a raw package-level failure.

## 2. Environment assumptions

The TUI has two supported modes.

### Live API mode

Set:

- `CODEX_SWARM_API_BASE_URL`
- `CODEX_SWARM_API_TOKEN`

Example:

```bash
export CODEX_SWARM_API_BASE_URL=http://localhost:3000
export CODEX_SWARM_API_TOKEN=codex-swarm-dev-token
corepack pnpm tui
```

Use live mode when validating:

- real runs and task kanban state
- approvals and validations
- worker fleet and dispatch health
- governance and review drilldowns

### Mock fallback mode

If `CODEX_SWARM_API_BASE_URL` is unset, the TUI starts in mock fallback mode.

Use mock fallback mode when validating:

- package launch and dependency wiring
- layout quality
- keyboard navigation
- empty or disconnected-state handling without a live control plane

## 3. Operator start workflow

1. Confirm the workspace is installed:
   `corepack pnpm install`
2. If you need live data, export `CODEX_SWARM_API_BASE_URL` and
   `CODEX_SWARM_API_TOKEN`.
3. Launch the TUI:
   `corepack pnpm tui`
4. Verify the header mode banner:
   - `LIVE API` means the TUI is reading the configured control plane
   - `MOCK FALLBACK` means the TUI is rendering its offline data model
5. Use the built-in keybindings:
   - `1` board
   - `2` run
   - `3` review
   - `4` fleet
   - `5` or `?` help
   - arrow keys or `h/j/k/l` to change the selected run
   - `r` for a manual refresh
   - space to toggle live refresh
   - `q` to quit

## 4. Capture workflow

### Quick launch capture

Use the checked-in helper:

```bash
corepack pnpm tui:capture
```

Optional overrides:

```bash
TUI_CAPTURE_LABEL=live-launch \
TUI_CAPTURE_SECONDS=12 \
TUI_CAPTURE_COLUMNS=140 \
TUI_CAPTURE_ROWS=40 \
CODEX_SWARM_API_BASE_URL=http://localhost:3000 \
CODEX_SWARM_API_TOKEN=codex-swarm-dev-token \
corepack pnpm tui:capture
```

The helper writes:

- `.ops/tui-captures/<label>/session.typescript`
- `.ops/tui-captures/<label>/metadata.json`

Use this for:

- launch evidence
- a quick board transcript
- disconnected or mock-fallback proof

The helper forces a stable terminal geometry by default:

- `TUI_CAPTURE_COLUMNS=140`
- `TUI_CAPTURE_ROWS=40`

Override those values only if QA needs a different review size.

### Interactive capture for QA evidence

For longer captures that require manual navigation across views:

```bash
mkdir -p .ops/tui-captures/manual-review
script -q -e -c "corepack pnpm tui" .ops/tui-captures/manual-review/session.typescript
```

During the interactive capture, navigate through:

- board overview
- run detail
- review/governance
- fleet/dispatch
- help

Save terminal screenshots in the same capture directory so the transcript and
PNG evidence stay together for QA review.

## 5. Expected evidence bundle

Per the acceptance matrix, a strong evidence set should include:

- launch command output
- package-level `apps/tui` typecheck/build/test results
- workspace `ci:typecheck`, `ci:test`, and `ci:build` results
- a launch or live-board transcript under `.ops/tui-captures/`
- screenshots for board, run, review, fleet, and help views

## 6. Common failure interpretation

Use these quick checks before escalating:

- launch fails before render:
  run `corepack pnpm install`, then retry `corepack pnpm tui`
- TUI starts in `MOCK FALLBACK` unexpectedly:
  check `CODEX_SWARM_API_BASE_URL` and `CODEX_SWARM_API_TOKEN`
- API mode degrades after launch:
  confirm `GET /health` and `GET /api/v1/metrics`
- captures are missing:
  verify `.ops/tui-captures/<label>/` was created and the operator has write
  access to the repo worktree
