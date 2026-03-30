# Swarm Plan

## Goal
Projects should be able to plan repeatable runs that are able to react to modular external events - the first and DOD implementation will be triggering repeatable pre-configured runs that are executed when a webhook is received

The target design should be extensible later with further external inputs and should allow passing the received event to the run context

An __EXAMPLE__ User story:

As a user of codex-swarm I would love it if codex-swarm could run preconfigured runs for a project on a received webhook. This will allow me to create a PR / Issue Review Run that triggers automatically when a new issue or PR is openend

__FUTURE__ extension but current __NON GOAL__: we could extend this into service connections wrapped per upstream service that contain per service signals and pre defined configuration how to handle them. (these are only examples and are CLEARLY NON_GOAL - ready made connection to atlassian, gitlab, github, ms.......)

## Summary
Implement repeatable webhook-triggered runs by adding extensible trigger configuration, inbound webhook handling, run-context event propagation, execution wiring, UI/API management, and operational documentation while keeping upstream service-specific integrations out of scope.

## Tasks

1. Define extensible external trigger architecture
   Role: tech-lead
   Description: Design the first-class model for repeatable project runs that can be triggered by modular external events, with webhook reception as the initial implementation. Specify how trigger definitions reference preconfigured run templates, how inbound event payloads are normalized into run context, and how the design remains extensible for future non-webhook input sources without introducing service-specific connectors in this milestone.
   Acceptance Criteria:
   - Architecture defines entities and lifecycle for reusable run configuration, external trigger definitions, and inbound event context propagation.
   - Webhook is explicitly scoped as the first trigger type while future trigger/input types can be added without breaking the core model.
   - Run context contract includes a structured place for the received event payload and trigger metadata.
   - Non-goals exclude upstream vendor-specific service connection implementations in this milestone.

2. Add shared contracts for trigger configuration and event context
   Role: backend-developer
   Description: Implement shared contract types and validation schemas for repeatable run definitions, webhook trigger configuration, inbound event envelopes, and the run context shape that carries received external event data through orchestration.
   Acceptance Criteria:
   - Shared contracts validate trigger configuration, webhook metadata, and event-to-run context payloads.
   - Contracts are usable by API, worker, and frontend without duplicating schema definitions.
   - Run context schema supports passing the received event and trigger metadata into execution.
   - Schema design is additive and leaves room for future external input types.

3. Implement webhook ingestion and run triggering API flow
   Role: backend-developer
   Description: Add API support for receiving configured webhooks, validating the trigger configuration, storing audit information, and enqueueing the corresponding repeatable run with the normalized event attached to run context.
   Acceptance Criteria:
   - API exposes a webhook ingestion path that resolves a configured repeatable run trigger.
   - Inbound requests are validated against configured trigger definitions before a run is created.
   - Triggered runs persist enough audit information to trace webhook receipt to run creation.
   - The enqueued run includes normalized event data in the run context passed to orchestration.

4. Propagate external event context through worker execution
   Role: backend-developer
   Description: Update worker and orchestration execution paths so triggered runs receive the external event context consistently, making it available to repeatable run logic and downstream agents without special-casing webhook semantics inside the core execution loop.
   Acceptance Criteria:
   - Worker execution loads and forwards external event context from the triggered run record into runtime context.
   - Repeatable run execution can read structured trigger metadata and original/normalized event payloads.
   - Execution changes do not regress manually started runs that have no external event context.
   - Core execution remains generic enough to support future trigger sources beyond webhooks.

5. Add project-facing configuration surfaces for repeatable webhook runs
   Role: frontend-developer
   Description: Implement frontend support to create, inspect, and manage repeatable run configurations and webhook trigger definitions so users can configure automatic runs for cases like PR or issue review without editing raw backend records.
   Acceptance Criteria:
   - UI lets users associate a repeatable run configuration with a webhook trigger for a project.
   - UI surfaces the trigger status and enough detail to understand what event data will be passed to the run.
   - Validation errors and misconfiguration states from API contracts are shown clearly.
   - Frontend uses shared contracts/endpoints rather than introducing divergent trigger models.

6. Verify end-to-end behavior and document operator workflow
   Role: technical-writer
   Description: Produce end-to-end verification coverage and operational documentation for configuring a repeatable webhook-triggered run, receiving a webhook, and observing the resulting run with attached event context. Document current scope and explicit non-goals for future service-specific integrations.
   Acceptance Criteria:
   - Verification covers configured webhook receipt leading to creation and execution of the intended repeatable run.
   - Documentation explains how event payload and trigger metadata are available in run context.
   - Operational docs describe setup, expected behavior, and debugging/audit points for webhook-triggered runs.
   - Docs clearly state that service-specific integrations and connection packs are future work and not part of this delivery.
