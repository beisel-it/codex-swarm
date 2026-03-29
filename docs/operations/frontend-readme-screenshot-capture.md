# Frontend README Screenshot Capture

This document defines the stable demo setup for README screenshots of the React operator console.

## Launch

Start the frontend locally:

```bash
corepack pnpm install
corepack pnpm dev:frontend:readme-capture
```

Open the Vite app and force deterministic demo data with `?demo=mock`. The mock capture mode does not depend on the live API and includes seeded approval, diff, governance, fleet, and transcript detail so the major surfaces render without loading or broken states.

Base URL during local development:

```text
http://127.0.0.1:5173/?demo=mock
```

## Capture Presets

Each preset is a stable URL target. `capture` selects the intended surface, `run` selects the seeded run, and the app keeps the query string aligned as you move between surfaces.

| Surface | Desktop URL | Mobile URL |
| --- | --- | --- |
| Board | `/?demo=mock&capture=board-desktop` | `/?demo=mock&capture=board-mobile` |
| Run detail | `/?demo=mock&capture=detail-desktop` | `/?demo=mock&capture=detail-mobile` |
| Review | `/?demo=mock&capture=review-desktop` | `/?demo=mock&capture=review-mobile` |
| Admin | `/?demo=mock&capture=admin-desktop` | `/?demo=mock&capture=admin-mobile` |

Recommended screenshot output targets under `docs/assets/screenshots/`:

| Surface | Desktop file | Mobile file |
| --- | --- | --- |
| Board | `readme-board-desktop.png` | `readme-board-mobile.png` |
| Run detail | `readme-run-detail-desktop.png` | `readme-run-detail-mobile.png` |
| Review | `readme-review-desktop.png` | `readme-review-mobile.png` |
| Admin | `readme-admin-desktop.png` | `readme-admin-mobile.png` |

The public README currently embeds mobile screenshots for board and run detail only.

- Review and admin mobile presets remain available for capture verification, but the current framing is not strong enough for the public README layout.
- Until a future recapture improves those mobile compositions, the README should continue using desktop review/admin screenshots only.

## Fleet Screenshot Decision

The public README does not need a dedicated fleet screenshot.

- Fleet state is already visible in the approved board capture and reinforced by the run-detail capture, so a separate fleet section adds little product coverage in the README.
- The current `readme-fleet-desktop.png` is not approved for README use because it exposes local filesystem and workspace path text in the repository and plan panels.
- Exclude `readme-fleet-desktop.png` from the README refresh and from the stable README shot list unless a future doc change explicitly re-approves a recaptured asset.

If a future README revision needs a dedicated fleet screenshot, it must meet these public-safe requirements before it can be added back to the shot list:

- No local filesystem paths, workspace root paths, `file:///` URLs, home-directory names, or other machine-local identifiers may appear anywhere in frame.
- The shot must stay inside product UI that materially adds information not already visible in the board capture.
- The asset must be documented here with a stable preset URL and output filename before capture.

The presets intentionally map to these seeded runs:

- `run-alpha` for board, run detail, and admin because it includes active execution, PR handoff, multi-node placement, validations, and governance context.
- `run-beta` for review because it includes a pending approval, diff artifact, failed validation, and stale reviewer session.

## Viewport Targets

Use the same viewport sizes for every capture pass:

- Desktop: `1440x1180`
- Mobile: `393x852`

These sizes keep the full top-level frame visible while preserving a realistic README-friendly crop.

Browser setup for repeatable captures:

- Desktop: plain Chromium page at `1440x1180`, device scale factor `1`, bookmarks/sidebar hidden.
- Mobile: device emulation at `393x852` using an iPhone 14 or equivalent DPR `3` profile, browser chrome hidden.
- Theme: keep the app on `system` unless the README explicitly requests a themed variant.
- Zoom: browser zoom `100%`.
- Sidebar: use preset width on desktop and do not manually resize unless the URL includes an explicit `sidebar` override.

## Surface Notes

- Board: shows the main operator shell, run inventory, fleet visibility, pending approvals, validations, and the task board.
- Run detail: shows repository and provider context, placement diagnostics, activity timeline, and session transcript.
- Review: shows approval context, diff summary, changed-file evidence, raw diff preview, validation history, and artifacts.
- Admin: shows actor identity, workspace boundary, governance report, approval provenance, secret access plan, and audit export summary.

## Optional Overrides

The capture URLs also support direct state overrides when a single surface needs a narrower crop:

- `view=board|detail|review|admin`
- `run=<runId>`
- `approval=<approvalId>`
- `artifact=<artifactId>`
- `transcript=<sessionId>`
- `theme=<themeName>`
- `sidebar=<width>`
- `dag=1`
- `agents=1`

Example:

```text
http://127.0.0.1:5173/?demo=mock&view=review&run=run-beta&approval=approval-plan&artifact=artifact-diff-beta
```

## Expected Demo Data

The seeded screenshot mode now includes:

- active run, blocked run, PR handoff, and repository inventory data
- fleet health with online, degraded, and draining worker nodes
- review approvals with linked diff evidence
- diff file summaries and inline raw diff preview
- governance report, retention, secret-access, and audit-export context
- session transcripts for run-detail screenshots

If a future README capture needs new surfaces, extend the preset table, re-approve the surface in this document, and keep the data deterministic in `frontend/src/App.tsx`.

## Capture Pass Checklist

1. Start `corepack pnpm dev:frontend:readme-capture`.
2. Open the preset URL for the target surface and wait for the demo badge to read `Demo snapshot`.
3. Confirm the selected run matches the seeded target:
   - `run-alpha` for board, run detail, and admin
   - `run-beta` for review
4. Capture the desktop shot at `1440x1180`.
5. Capture the mobile shot at `393x852`.
6. Save the outputs to `docs/assets/screenshots/` using the stable filenames above.
7. Do not capture or ship `readme-fleet-desktop.png` for the public README unless this document is updated with a re-approved fleet preset and safety review.
