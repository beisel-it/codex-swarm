# Swarm Plan

## Goal
# Automatische Task-DoD-Verifikation mit Reviewer-Paarung

  ## Summary

  Jeder vom Leader erzeugte Task bekommt ein neues strukturiertes Feld definitionOfDone. Der Ausführer-Agent erhält diese DoD im Worker-Prompt und darf einen Task nicht mehr endgültig selbst freigeben.
  Stattdessen läuft jeder DoD-fähige Task durch einen zweiten, automatisch erzeugten Verifikationsschritt. Der Verifier prüft die gelieferte Arbeit gegen die gespeicherte DoD und meldet nur das Ergebnis an
  den Leader: bei Erfolg wird der Task abgeschlossen, bei Fehlern erzeugt der Leader einen neuen Rework-/Change-Request-Task auf Basis der Verifier-Findings.

  ## Key Changes

  - Leader-Plan und Task-Verträge
      - LeaderPlanTask und das Leader-JSON-Schema in packages/orchestration um definitionOfDone: string[] erweitern.
      - Persistiertes Task-Schema in packages/contracts und API-Create-Flow um definitionOfDone erweitern; acceptanceCriteria bleibt bestehen, dient aber nur noch als menschenlesbare Kurzfassung bzw.
        Kompatibilitätsfläche.
      - Leader-Prompts so verschärfen, dass für jeden Task zwingend eine konkrete, überprüfbare DoD geliefert werden muss.
      - Plan-Artefakte und Task-Detail-Ausgaben um die DoD ergänzen, damit Operatoren und Folgeagenten dieselbe Soll-Definition sehen.
  - Ausführungs- und Review-Lifecycle
      - Worker-Outcomes behalten completed|needs_slicing|blocked, aber completed bedeutet nur noch "bereit zur Verifikation", nicht direkt "Task final abgeschlossen".
      - Nach erfolgreichem Worker-Assignment wird der Task in awaiting_review überführt und eine Verifier-Assignment erzeugt, statt ihn direkt auf completed zu setzen.
      - Verifier erhält einen eigenen Prompt mit Taskbeschreibung, definitionOfDone, acceptanceCriteria, Worker-Summary, vorhandenen Artefakten, Validations und relevanten Nachrichten.
      - Neuer Verifier-Outcome in packages/orchestration, z. B. passed|failed|blocked plus findings[], changeRequests[], optionale Evidenz-Artefakte und Nachricht an den Leader.
      - Bei passed wird der ursprüngliche Task auf completed gesetzt.
      - Bei failed bleibt der ursprüngliche Task offen bzw. geht in einen Rework-Zustand über, und der Leader erzeugt genau einen neuen Follow-up-Task mit den Verifier-Change-Requests; der ursprüngliche Task
        hängt von diesem Rework-Task ab oder wird darüber wieder geöffnet.
      - Bei blocked des Verifiers wird wie heute über den Leader eskaliert, nicht durch direkte Task-Erzeugung des Verifiers.
      - validationTemplates bleiben erhalten und laufen weiterhin als maschinelle Prüfung; der Verifier nutzt deren Resultate als Evidenz, ersetzt sie aber nicht.
  - Rollen- und Scheduling-Regeln
      - Primärer Verifier-Typ ist eine vorhandene Review-Rolle des Teams; bevorzugt reviewer, sonst jede bestehende Rolle mit Review-Charakter wie visual-reviewer.
      - Falls kein geeigneter Reviewer vorhanden ist, fällt die Verifikation auf einen zweiten Agenten derselben Fachrolle wie der Ausführer zurück.
      - Der Verifier muss immer ein anderer Agent als der Ausführer sein.
      - Dispatch-/Concurrency-Logik so anpassen, dass der Verifier als zweiter Schritt desselben Tasks eingeplant wird, ohne den DAG zu duplizieren.
      - Run-Abschlusslogik so ändern, dass awaiting_review nie als abgeschlossen zählt und ein Run erst fertig ist, wenn alle Tasks die Verifikation bestanden haben.
  - API, Observability und UI
      - Task- und Run-Responses um DoD- und Verifikationsmetadaten ergänzen, mindestens: definitionOfDone, verificationStatus, verifierAgentId, latestVerificationSummary.
      - Neue Control-Plane-Events ergänzen, z. B. task.verification_requested, task.verification_passed, task.verification_failed.
      - Review-/Board-/Lifecycle-Flächen so erweitern, dass sichtbar ist: Ausführer fertig, Verifikation läuft, Verifikation fehlgeschlagen, Rework angefordert.
  - Run-/Task-Status-Reconciliation, Dispatch-Queueing und Concurrency verhalten sich korrekt mit Worker+Verifier-Paaren.
  - UI/TUI zeigen DoD, Verifikationsstatus und offene Change Requests konsistent an.
  - Bestehende Validation-Template-Flows bleiben funktionsfähig und werden als Evidenz im Verifier-Prompt sichtbar.

  ## Assumptions and Defaults

  - definitionOfDone ist das normative Prüfziel; acceptanceCriteria bleibt aus Kompatibilitäts- und UI-Gründen bestehen.
  - Verifier dürfen keine Folge-Tasks direkt anlegen und keine Fixes selbst ausführen; nur der Leader resliced bzw. erzeugt Rework.
  - Jede taskgebundene Verifikation ist verpflichtend für alle neuen Leader-generierten Tasks.
  - Verifikations-Fallback ohne Reviewer-Rolle erfolgt auf einen zweiten Agenten derselben Fachrolle.
  - Vorhandene Runs/Tasks ohne definitionOfDone bleiben lesbar; die neue automatische Verifikation gilt nur für neu geplante Tasks nach dem Schema-Upgrade.

## Summary
Initial near-term swarm slice covers contract/schema groundwork, verification lifecycle implementation, operator-facing UI states, repeatable validation, documentation, and an integration review before closure.

## Tasks

1. Define verification UX states and task detail presentation
   Role: designer
   Description: Design the operator-facing states for task execution and verification so board, review, lifecycle, and task detail surfaces show definition of done, awaiting_review, verification passed, verification failed, and rework requested consistently.
   Acceptance Criteria:
   - State definitions cover board cards, task detail, review views, and lifecycle history for the new verification flow.
   - Design notes specify how definitionOfDone, verificationStatus, verifier identity, latest verification summary, and open change requests should be displayed.
   - Handoff includes explicit UI copy and empty/loading/error states for verification metadata.

2. Extend planning and persisted task contracts with definition of done
   Role: backend-developer
   Description: Add definitionOfDone to leader planning schemas, persisted task contracts, API create/read flows, and task artifacts while keeping acceptanceCriteria as a compatibility-facing summary field. Tighten leader prompt contracts so new tasks always include concrete, testable DoD items.
   Acceptance Criteria:
   - Leader plan task types and emitted leader JSON schema include definitionOfDone: string[] for newly planned tasks.
   - Persisted task schemas and task creation/read APIs carry definitionOfDone without breaking reads of legacy tasks that lack it.
   - Task detail and plan artifacts expose definitionOfDone alongside acceptanceCriteria for downstream agents and operators.
   - Leader prompt contract requires concrete, verifiable definitionOfDone output for every new task.

3. Implement verifier pairing and review-gated task completion
   Role: backend-developer
   Description: Change orchestration so worker completion means ready for verification, then enqueue a distinct verifier assignment for a different agent, prefer reviewer-type roles with fallback to a second agent of the worker's specialty, capture verifier outcomes and findings, gate task completion on passed, and drive failed/blocking paths through the leader without verifier-authored follow-up tasks.
   Acceptance Criteria:
   - Worker completed outcomes transition tasks into awaiting_review instead of directly completed, and run completion logic excludes awaiting_review tasks.
   - Verifier assignment is created automatically with a different agent than the worker, preferring reviewer roles and otherwise falling back to a second agent of the same functional role.
   - Verifier prompt includes task description, definitionOfDone, acceptanceCriteria, worker summary, artifacts, validations, and relevant messages.
   - Verifier outcomes support passed, failed, and blocked with findings/change requests/evidence and update task state accordingly.
   - Failed verification does not let the verifier create tasks directly and instead returns structured findings that the leader can use for a single rework task.
   - Control-plane events and API responses expose verificationStatus, verifierAgentId, latestVerificationSummary, and related verification metadata.

4. Expose definition of done and verification lifecycle in product surfaces
   Role: frontend-developer
   Description: Implement the designed UI changes so board, review, lifecycle, and task detail surfaces show definitionOfDone, verification progress, verifier metadata, latest verification summary, and open change requests using the new backend contracts.
   Acceptance Criteria:
   - Task detail surfaces render definitionOfDone and distinguish it from acceptanceCriteria.
   - Board and lifecycle views visibly differentiate worker finished, verification running, verification failed, rework requested, and completed after verification.
   - Review-oriented surfaces show verifier metadata, latest verification summary, and open change requests when present.
   - UI behavior matches the agreed design states and handles absent verification metadata for legacy tasks gracefully.

5. Prove verification-gated completion with repeatable checks
   Role: tester
   Description: Add repeatable test coverage and validation evidence for the new contracts and execution lifecycle, including legacy compatibility, verifier pairing rules, run completion gating, and validation-template evidence propagation into verifier context.
   Acceptance Criteria:
   - Automated coverage exercises new-task creation with definitionOfDone and legacy-task reads without it.
   - Lifecycle tests prove worker completion routes to awaiting_review, verifier assignment is distinct from the worker, and only passed verification leads to completed.
   - Failure-path tests prove verifier findings do not create tasks directly and instead leave actionable data for leader-driven rework.
   - Run reconciliation and queueing tests cover worker plus verifier pairing without DAG duplication or premature run completion.
   - Validation-template results remain functional and are visible as evidence in verifier inputs or stored verification context.

6. Document operator and rollout changes for DoD-based verification
   Role: technical-writer
   Description: Update operator-facing and rollout documentation to explain the new meaning of definitionOfDone, the worker-to-verifier lifecycle, reviewer fallback rules, legacy-task behavior, and how change requests and verification states appear in the system.
   Acceptance Criteria:
   - Docs explain that definitionOfDone is the normative verification target and acceptanceCriteria remains a compatibility-oriented summary.
   - Operator guidance describes awaiting_review, verification outcomes, rework handling, and verifier non-authority to create follow-up tasks directly.
   - Rollout notes cover legacy tasks without definitionOfDone and clarify that mandatory automatic verification applies to newly planned tasks only.
   - Documentation references the UI and API fields operators will use to inspect verification state and findings.

7. Review end-to-end correctness of the verification pairing change
   Role: reviewer
   Description: Perform a focused integration review of the shipped backend, frontend, tests, and docs to catch regressions in pairing rules, task closure semantics, rework generation boundaries, and operator visibility before the milestone is accepted.
   Acceptance Criteria:
   - Review checks that no task can be finally closed from worker completion alone for the new flow.
   - Review verifies verifier-agent separation, reviewer-role preference, and same-role fallback behavior are implemented consistently.
   - Review confirms failed verification yields leader-consumable findings/change requests without verifier-side fixes or direct follow-up task creation.
   - Review reports any remaining correctness or rollout risks across API, orchestration, UI, and documentation.
