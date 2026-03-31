# Codex Swarm Landing Zone

This directory contains the first-pass Eleventy landing page for Codex Swarm.

## Local development

```bash
cd apps/landing
corepack pnpm install
corepack pnpm dev
```

Build the static site with:

```bash
corepack pnpm build
```

The production build is written to `apps/landing/_site`.

## GitHub Pages

The repository publishes this app through `.github/workflows/landing-pages.yml`.
GitHub Pages should be configured to deploy from GitHub Actions.

## Project shape

- `src/index.njk`: landing page entry point
- `src/_data/landing.js`: copy, CTA, workflow, capability, and screenshot content
- `src/_data/site.js`: site metadata and canonical external links
- `src/_includes/partials/`: section templates
- `src/assets/css/site.css`: first-pass visual system and layout styles
- `src/assets/js/site.js`: lightweight progressive enhancement and reveal behavior
- `src/assets/images/`: imported logo, hero art, and README screenshots

## Editing content

- Update messaging, workflow steps, and CTA destinations in `src/_data/landing.js`
- Update site-wide metadata in `src/_data/site.js`
- Update section structure in `src/_includes/partials/`
- Replace imported screenshots or artwork in `src/assets/images/`
