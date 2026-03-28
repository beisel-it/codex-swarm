# Codex Swarm User Guide

## What Codex Swarm Does

Codex Swarm coordinates multi-agent software delivery across a control-plane API, worker runtime, and web board. A user can onboard a repository, start a run, review progress, approve or reject work, and inspect validations, artifacts, and governance state from the frontend.

## Core User Flows

### 1. Start from a repository

Users begin by selecting or onboarding a repository. Repository state includes:

- provider and trust metadata
- policy profile
- governance/sensitivity defaults
- publication and pull-request handoff state

### 2. Create and monitor a run

Runs move through the board and run-detail surfaces with:

- status and task progression
- worker/session placement
- approvals and review history
- validations and artifacts
- publish/PR handoff state

### 3. Review and approve work

Review surfaces expose:

- approval requests and resolution state
- requested and resolved payloads
- delegated approval provenance
- validations and artifacts linked to the relevant task or run

### 4. Inspect governance and admin state

Governed repositories and runs expose:

- actor and workspace context
- approval provenance
- policy inheritance and sensitive defaults
- audit summaries and secret access plan visibility

## Frontend Surface Checklist

The GA documentation set must include screenshot coverage for these surfaces:

- board overview
- run detail
- review and approval console
- governance and admin views
- fleet and node visibility panels

Frontend screenshot and walkthrough assets are produced under task `3a902ee5` and should be inserted into this guide before final GA signoff.

## Daily Usage Guidance

- Use the board to understand run state across tasks, approvals, agents, and worker placement.
- Use run detail when you need validation, artifact, approval, or publication specifics.
- Use the governance/admin views when you need policy, provenance, or audit detail rather than raw API output.
- Use review actions from the UI rather than manual API mutation when an approval or rejection path exists.

## Current Boundaries

- Cost reporting reflects budgeted run posture, not external provider billing.
- Secret access for governed repositories follows the bounded integration path documented in [Security](./operations/security.md).
- Support and SLO limits are documented in [SLO and Support Envelope](./operations/slo-support.md).
