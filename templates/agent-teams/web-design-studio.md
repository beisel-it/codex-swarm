# Web Design Studio Team Template

Use this template when a codex-swarm run needs to ship a visually distinctive
website or web experience for a design-led studio, agency, campaign, brand, or
product-marketing surface.

This team is optimized for mixed studio work:

- brand and campaign websites
- portfolio or editorial-style marketing surfaces
- product-led marketing pages and launch experiences
- design-heavy web interfaces where originality, polish, and iteration matter

It is not the default team for compact operator UIs or infrastructure-heavy
delivery. Use the checked-in development or platform templates for those.

## Team shape

- `leader`
  - owns sequencing, iteration loops, and closure of the visual and delivery objective
- `design-researcher`
  - researches the topic, audience, institution, and relevant reference landscape before art direction starts
- `art-director`
  - defines visual thesis, typography, palette, hierarchy, motion direction, and atmospheric treatment
- `design-engineer`
  - implements the experience in production-ready frontend code
- `visual-reviewer`
  - performs screenshot-first aesthetic review and anti-generic quality control
- `tester`
  - proves responsive behavior, browser behavior, and acceptance flows

Optional roles:

- collapse `design-researcher` into `art-director` only for genuinely small slices, and only if the team still produces explicit research and reference artifacts before visual direction starts
- `frontend-developer`
  - add when the work must integrate with complex app state, real APIs, or an existing product shell
- `reviewer`
  - add when the slice carries meaningful logic, integration, or regression risk beyond visual quality
- `technical-writer`
  - add when the client handoff, design-system usage, or rollout guidance must be documented

## Required role boundaries

- `design-researcher` owns topic research and reference gathering, not visual direction or production coding
- `art-director` owns direction, not production coding
- `design-engineer` owns implementation, not silent redesign
- `visual-reviewer` owns screenshot-first critique, not code ownership
- `tester` owns repeatable browser and breakpoint proof, not aesthetic direction

If those boundaries blur, the team will either produce generic work or lose the
independent iteration loop that design-heavy delivery needs.

## Recommended skill and tool loadout

- `design-researcher`
  - `web-search`
  - `images-search`
  - `Agent Browser` for inspecting live references
  - `view_image` for reviewing saved reference assets
- `art-director`
  - `frontend-design`
  - `build-web-apps:frontend-skill`
  - `nano-banana-pro` for concept frames, atmosphere studies, or visual references
- `design-engineer`
  - `frontend-design`
  - `build-web-apps:frontend-skill`
  - `build-web-apps:react-best-practices` when the stack is React or Next.js
  - `Agent Browser` for responsive and motion verification
- `visual-reviewer`
  - `Agent Browser`
  - `build-web-apps:web-design-guidelines`
- `tester`
  - `Agent Browser`

`nano-banana-pro` and `Agent Browser` are team capabilities, not standalone
roles. Keep them attached to the roles that need them.

For all design-heavy work, agents should make free use of `view_image` on
generated references, exported assets, screenshots, and other inspected visual
artifacts. Visual work should be judged from the actual image output, not from
file names, prompt text, or code alone.

Topic research is mandatory before design direction. If the goal is something
like recruiting young members for a volunteer fire brigade chapter, the team
should first research the organization, audience, civic context, trust signals,
and good reference material instead of jumping straight into a homepage layout.
That research should shape tone, imagery, proof points, CTA language, and the
kind of references the team treats as relevant.

## Launch pattern

1. `leader` frames the goal, audience, technical constraints, and success signal.
2. `design-researcher` produces:
   - `topic-research.md`
   - `reference-board.md`
   - `source-notes.md`
3. `art-director` produces:
   - `design-brief.md`
   - `art-direction-handoff.md`
   - optional concept imagery or mood frames
4. `design-engineer` implements from that handoff.
5. `visual-reviewer` inspects screenshots, recordings, and breakpoint states and
   returns concrete findings.
6. `design-engineer` iterates until the visual bar is met.
7. `tester` closes with browser and responsive evidence.
8. Optional `frontend-developer`, `reviewer`, and `technical-writer` join only
   when the slice actually needs their boundary.

## Minimum deliverables

- topic and audience research grounded in real sources
- explicit reference collection with notes on what is worth borrowing and what is not
- written visual thesis and section hierarchy
- implementation-ready art-direction handoff
- production-ready frontend implementation
- desktop and mobile screenshots
- browser evidence for key interactions and motion
- iteration notes recording major deviations from the art direction

## Done criteria

- topic framing, trust signals, and visual cues are grounded in the research pack rather than generic assumptions
- the first viewport has a clear visual anchor and does not look like a generic SaaS hero
- typography, palette, motion, and background treatment feel intentional and specific to the brief
- the rendered output holds together on desktop and mobile rather than only in one polished viewport
- visual review findings are resolved or explicitly waived
- the final browser evidence proves the delivered path, not just static mock states
