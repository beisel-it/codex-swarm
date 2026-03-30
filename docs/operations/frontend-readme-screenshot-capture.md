# Frontend README Screenshot Capture

This document defines the approved screenshot set for the public README.

The current process uses the existing staging frontend so the README shows real product data and current information architecture rather than seeded local mock state.

## Capture Source

Use the shared staging frontend:

```text
http://debian-4gb-hel1-1.drake-emperor.ts.net:4310/
```

The staging frontend already exposes the runtime config needed to talk to the paired API. No separate local demo mode is required for the README refresh.

## Approved Surface List

Capture these desktop-only surfaces and save them under `docs/assets/screenshots/`:

| Surface | URL | Output file |
| --- | --- | --- |
| Projects | `/projects` | `readme-projects-desktop.png` |
| Project runs | `/projects/cf58874d-118e-47f5-9e24-d680973935a8/runs` | `readme-project-runs-desktop.png` |
| Project automation | `/projects/cf58874d-118e-47f5-9e24-d680973935a8/automation` | `readme-project-automation-desktop.png` |
| Ad-hoc runs | `/adhoc-runs` | `readme-adhoc-runs-desktop.png` |
| Run board | `/runs/f0053f3f-6bba-4322-8b67-b1ac079eb27d/board` | `readme-run-board-desktop.png` |
| Run lifecycle | `/runs/f0053f3f-6bba-4322-8b67-b1ac079eb27d/lifecycle` | `readme-run-lifecycle-desktop.png` |
| Settings | `/settings` | `readme-settings-desktop.png` |

The README does not currently include:

- mobile screenshots
- a dedicated review screenshot

The review surface is intentionally excluded from this refresh because the current staging data set has no approval-backed review content worth publishing.

## Viewport and Framing

Use the same browser setup for every shot:

- desktop viewport: `1440x1180`
- browser zoom: `100%`
- light/default appearance
- browser chrome hidden

Framing rules:

- keep the global shell and local context visible
- center the primary content for the target surface
- avoid captures that expose machine-local filesystem paths or other operator-only local identifiers
- for run surfaces, it is acceptable to hide the `Quick links` sidebar block before capture if it contains local path text

## Surface Notes

- `Projects`: emphasize the actual inventory table, not just the summary counters
- `Project runs`: show project context header, tab row, and run list actions
- `Project automation`: show repeatable runs plus the webhook trigger preset/optional-control layout
- `Ad-hoc runs`: keep the real compact empty state if no unassigned runs exist
- `Run board`: show the board-first layout with blockers and diagnostics beneath it
- `Run lifecycle`: show placement/recovery/events style content rather than only the shared run header
- `Settings`: show settings scope plus meaningful workspace/policy/provider content

## Asset Hygiene

The current README shot list replaces the older legacy files:

- `readme-board-desktop.png`
- `readme-run-detail-desktop.png`
- `readme-review-desktop.png`
- `readme-admin-desktop.png`
- all `readme-*-mobile.png`

Do not reintroduce those files into the README unless the public README structure changes again.

## Capture Checklist

1. Open the staging route for the target surface.
2. Confirm the page has settled and the target content is visible.
3. Remove or avoid any local-path-only sidebar content that is not safe for public docs.
4. Capture the desktop screenshot.
5. Save it with the exact approved filename in `docs/assets/screenshots/`.
6. Verify `README.md` references only the current approved files.
