import { useEffect, useMemo, useState } from "react";
import type {
  ExternalEventReceipt,
  ProjectTeamDetail,
  RepeatableRunDefinition,
  RepeatableRunDefinitionCreateInput,
  RepeatableRunTrigger,
  RepeatableRunTriggerCreateInput,
} from "../../packages/contracts/src/index.ts";

type RepositoryOption = {
  id: string;
  name: string;
  provider?: "github" | "gitlab" | "local" | "other";
};

type RepeatableRunTriggerUpdateInput = Partial<
  Omit<RepeatableRunTriggerCreateInput, "kind">
> & {
  config?: Partial<RepeatableRunTriggerCreateInput["config"]>;
};

type RepeatableRunsPanelProps = {
  repositories: RepositoryOption[];
  projectTeams: ProjectTeamDetail[];
  selectedRepositoryId: string;
  onSelectedRepositoryIdChange: (repositoryId: string) => void;
  definitions: RepeatableRunDefinition[];
  triggers: RepeatableRunTrigger[];
  receipts: ExternalEventReceipt[];
  actionPending: boolean;
  errorText: string;
  onCreateDefinition: (
    input: RepeatableRunDefinitionCreateInput,
  ) => Promise<void>;
  onUpdateDefinition: (
    definitionId: string,
    input: Partial<RepeatableRunDefinitionCreateInput>,
  ) => Promise<void>;
  onDeleteDefinition: (definition: RepeatableRunDefinition) => Promise<void>;
  onCreateTrigger: (input: RepeatableRunTriggerCreateInput) => Promise<void>;
  onUpdateTrigger: (
    triggerId: string,
    input: RepeatableRunTriggerUpdateInput,
  ) => Promise<void>;
  onDeleteTrigger: (trigger: RepeatableRunTrigger) => Promise<void>;
};

type WebhookShape = "generic" | "github";

const DEFAULT_MAX_PAYLOAD_BYTES = 1024 * 1024;
const GITHUB_EVENT_HEADER = "x-github-event";
const GITHUB_DELIVERY_HEADER = "x-github-delivery";
const GENERATED_ENDPOINT_PLACEHOLDER =
  "/webhooks/triggers/<assigned on create>";

function parseCsvList(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function formatLabel(value: string) {
  return value.replace(/_/g, " ");
}

function formatDateTime(input: string | Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(input));
}

function summarizeExecution(definition: RepeatableRunDefinition) {
  const pieces = [
    definition.execution.branchName
      ? `branch ${definition.execution.branchName}`
      : "default branch",
    `cap ${definition.execution.concurrencyCap}`,
  ];

  if (definition.execution.policyProfile) {
    pieces.push(definition.execution.policyProfile);
  }

  return pieces.join(" · ");
}

function describeEventContext(trigger: RepeatableRunTrigger) {
  if (trigger.kind !== "webhook") {
    return [];
  }

  return [
    `externalInput.kind = webhook`,
    `trigger.name = ${trigger.name}`,
    `event.eventId = ${trigger.config.deliveryIdHeader ?? "generated UUID when header is missing"}`,
    `event.eventName = ${trigger.config.eventNameHeader ?? "null unless payload-based handling is added later"}`,
    `event.action = payload.action when present`,
    `event.payload = raw webhook JSON body`,
    `event.request = method, path, query, headers, size, IP, user agent`,
  ];
}

function inferTriggerShape(
  repository: RepositoryOption | null,
  trigger?: RepeatableRunTrigger | null,
): WebhookShape {
  if (repository?.provider === "github") {
    return "github";
  }

  if (trigger?.kind === "webhook") {
    if (
      trigger.config.eventNameHeader === GITHUB_EVENT_HEADER ||
      trigger.config.deliveryIdHeader === GITHUB_DELIVERY_HEADER
    ) {
      return "github";
    }
  }

  return "generic";
}

function buildEmptyTriggerConfig() {
  return {
    secretRef: "",
    signatureHeader: "",
    eventNameHeader: "",
    deliveryIdHeader: "",
    maxPayloadBytes: String(DEFAULT_MAX_PAYLOAD_BYTES),
    allowPost: true,
    allowPut: false,
    filterEventNames: "",
    filterActions: "",
    filterBranches: "",
    enableRequestMatching: false,
    enableSecurity: false,
    enableEventMatching: false,
    enableDeliveryMetadata: false,
  };
}

export function RepeatableRunsPanel({
  repositories,
  projectTeams,
  selectedRepositoryId,
  onSelectedRepositoryIdChange,
  definitions,
  triggers,
  receipts,
  actionPending,
  errorText,
  onCreateDefinition,
  onUpdateDefinition,
  onDeleteDefinition,
  onCreateTrigger,
  onUpdateTrigger,
  onDeleteTrigger,
}: RepeatableRunsPanelProps) {
  const [editingDefinitionId, setEditingDefinitionId] = useState("");
  const [definitionName, setDefinitionName] = useState("");
  const [definitionDescription, setDefinitionDescription] = useState("");
  const [definitionProjectTeamId, setDefinitionProjectTeamId] = useState(
    () => projectTeams[0]?.id ?? "",
  );
  const [definitionStatus, setDefinitionStatus] =
    useState<RepeatableRunDefinition["status"]>("active");
  const [definitionGoal, setDefinitionGoal] = useState("");
  const [definitionBranchName, setDefinitionBranchName] = useState("main");
  const [definitionPlanArtifactPath, setDefinitionPlanArtifactPath] =
    useState("");
  const [definitionConcurrencyCap, setDefinitionConcurrencyCap] = useState("1");
  const [definitionPolicyProfile, setDefinitionPolicyProfile] = useState("");

  const [editingTriggerId, setEditingTriggerId] = useState("");
  const [triggerRepeatableRunId, setTriggerRepeatableRunId] = useState("");
  const [triggerName, setTriggerName] = useState("");
  const [triggerDescription, setTriggerDescription] = useState("");
  const [triggerEnabled, setTriggerEnabled] = useState(true);
  const [triggerShape, setTriggerShape] = useState<WebhookShape>("generic");
  const [resolvedEndpointPath, setResolvedEndpointPath] = useState("");
  const [secretRef, setSecretRef] = useState("");
  const [signatureHeader, setSignatureHeader] = useState("");
  const [eventNameHeader, setEventNameHeader] = useState("");
  const [deliveryIdHeader, setDeliveryIdHeader] = useState("");
  const [maxPayloadBytes, setMaxPayloadBytes] = useState(
    String(DEFAULT_MAX_PAYLOAD_BYTES),
  );
  const [allowPost, setAllowPost] = useState(true);
  const [allowPut, setAllowPut] = useState(false);
  const [filterEventNames, setFilterEventNames] = useState("");
  const [filterActions, setFilterActions] = useState("");
  const [filterBranches, setFilterBranches] = useState("");
  const [enableRequestMatching, setEnableRequestMatching] = useState(false);
  const [enableSecurity, setEnableSecurity] = useState(false);
  const [enableEventMatching, setEnableEventMatching] = useState(false);
  const [enableDeliveryMetadata, setEnableDeliveryMetadata] = useState(false);
  const [endpointCopied, setEndpointCopied] = useState(false);

  const scopedDefinitions = useMemo(
    () =>
      definitions.filter(
        (definition) => definition.repositoryId === selectedRepositoryId,
      ),
    [definitions, selectedRepositoryId],
  );

  const scopedTriggers = useMemo(() => {
    const definitionIds = new Set(
      scopedDefinitions.map((definition) => definition.id),
    );
    return triggers.filter((trigger) =>
      definitionIds.has(trigger.repeatableRunId),
    );
  }, [scopedDefinitions, triggers]);

  const scopedReceipts = useMemo(() => {
    const triggerIds = new Set(scopedTriggers.map((trigger) => trigger.id));
    return receipts.filter((receipt) =>
      triggerIds.has(receipt.repeatableRunTriggerId),
    );
  }, [receipts, scopedTriggers]);

  const effectiveTriggerRepeatableRunId =
    triggerRepeatableRunId || scopedDefinitions[0]?.id || "";
  const selectedRepository =
    repositories.find((repository) => repository.id === selectedRepositoryId) ??
    null;
  const effectiveTriggerShape =
    editingTriggerId ||
    triggerName ||
    triggerDescription ||
    triggerRepeatableRunId
      ? triggerShape
      : inferTriggerShape(selectedRepository);
  const displayedEndpointPath =
    resolvedEndpointPath || GENERATED_ENDPOINT_PLACEHOLDER;

  useEffect(() => {
    if (!selectedRepositoryId && repositories[0]?.id) {
      onSelectedRepositoryIdChange(repositories[0].id);
    }
  }, [onSelectedRepositoryIdChange, repositories, selectedRepositoryId]);

  useEffect(() => {
    if (!endpointCopied) {
      return;
    }

    const timeout = window.setTimeout(() => setEndpointCopied(false), 1200);
    return () => window.clearTimeout(timeout);
  }, [endpointCopied]);

  function resetDefinitionForm() {
    setEditingDefinitionId("");
    setDefinitionName("");
    setDefinitionDescription("");
    setDefinitionProjectTeamId(projectTeams[0]?.id ?? "");
    setDefinitionStatus("active");
    setDefinitionGoal("");
    setDefinitionBranchName("main");
    setDefinitionPlanArtifactPath("");
    setDefinitionConcurrencyCap("1");
    setDefinitionPolicyProfile("");
  }

  function resetTriggerForm(nextRepeatableRunId?: string) {
    const empty = buildEmptyTriggerConfig();
    const nextShape = inferTriggerShape(selectedRepository);

    setEditingTriggerId("");
    setTriggerRepeatableRunId(
      nextRepeatableRunId ?? scopedDefinitions[0]?.id ?? "",
    );
    setTriggerName("");
    setTriggerDescription("");
    setTriggerEnabled(true);
    setTriggerShape(nextShape);
    setResolvedEndpointPath("");
    setSecretRef(empty.secretRef);
    setSignatureHeader(empty.signatureHeader);
    setEventNameHeader(
      nextShape === "github" ? GITHUB_EVENT_HEADER : empty.eventNameHeader,
    );
    setDeliveryIdHeader(
      nextShape === "github" ? GITHUB_DELIVERY_HEADER : empty.deliveryIdHeader,
    );
    setMaxPayloadBytes(empty.maxPayloadBytes);
    setAllowPost(empty.allowPost);
    setAllowPut(empty.allowPut);
    setFilterEventNames(empty.filterEventNames);
    setFilterActions(empty.filterActions);
    setFilterBranches(empty.filterBranches);
    setEnableRequestMatching(empty.enableRequestMatching);
    setEnableSecurity(empty.enableSecurity);
    setEnableEventMatching(empty.enableEventMatching);
    setEnableDeliveryMetadata(empty.enableDeliveryMetadata);
    setEndpointCopied(false);
  }

  async function handleDefinitionSubmit() {
    if (
      !selectedRepositoryId ||
      !definitionProjectTeamId ||
      !definitionName.trim() ||
      !definitionGoal.trim()
    ) {
      return;
    }

    const payload: RepeatableRunDefinitionCreateInput = {
      repositoryId: selectedRepositoryId,
      projectTeamId: definitionProjectTeamId,
      name: definitionName.trim(),
      description: definitionDescription.trim() || null,
      status: definitionStatus,
      execution: {
        goal: definitionGoal.trim(),
        branchName: definitionBranchName.trim() || null,
        planArtifactPath: definitionPlanArtifactPath.trim() || null,
        budgetTokens: null,
        budgetCostUsd: null,
        concurrencyCap: Math.max(
          1,
          Number.parseInt(definitionConcurrencyCap, 10) || 1,
        ),
        policyProfile: definitionPolicyProfile.trim() || null,
        handoff: {
          mode: "manual",
          provider: null,
          baseBranch: null,
          autoPublishBranch: false,
          autoCreatePullRequest: false,
          titleTemplate: null,
          bodyTemplate: null,
        },
        metadata: {},
      },
    };

    if (editingDefinitionId) {
      await onUpdateDefinition(editingDefinitionId, payload);
    } else {
      await onCreateDefinition(payload);
    }

    resetDefinitionForm();
  }

  async function handleCopyEndpoint() {
    if (
      displayedEndpointPath === GENERATED_ENDPOINT_PLACEHOLDER ||
      !navigator.clipboard
    ) {
      return;
    }

    await navigator.clipboard.writeText(displayedEndpointPath);
    setEndpointCopied(true);
  }

  async function handleTriggerSubmit() {
    if (!effectiveTriggerRepeatableRunId || !triggerName.trim()) {
      return;
    }

    const allowedMethods: Array<"POST" | "PUT"> = [];
    if (allowPost) {
      allowedMethods.push("POST");
    }
    if (allowPut) {
      allowedMethods.push("PUT");
    }

    const payload: RepeatableRunTriggerCreateInput = {
      repeatableRunId: effectiveTriggerRepeatableRunId,
      name: triggerName.trim(),
      description: triggerDescription.trim() || null,
      enabled: triggerEnabled,
      kind: "webhook",
      config: {
        secretRef: enableSecurity ? secretRef.trim() || null : null,
        signatureHeader: enableSecurity ? signatureHeader.trim() || null : null,
        eventNameHeader: enableEventMatching
          ? eventNameHeader.trim() || null
          : null,
        deliveryIdHeader: enableDeliveryMetadata
          ? deliveryIdHeader.trim() || null
          : null,
        allowedMethods: enableRequestMatching
          ? allowedMethods.length > 0
            ? allowedMethods
            : ["POST"]
          : ["POST"],
        maxPayloadBytes: enableRequestMatching
          ? Math.max(
              1,
              Number.parseInt(maxPayloadBytes, 10) || DEFAULT_MAX_PAYLOAD_BYTES,
            )
          : DEFAULT_MAX_PAYLOAD_BYTES,
        filters: {
          eventNames: enableEventMatching ? parseCsvList(filterEventNames) : [],
          actions: enableEventMatching ? parseCsvList(filterActions) : [],
          branches: enableEventMatching ? parseCsvList(filterBranches) : [],
          metadata: {},
        },
        metadata: {},
      },
    };

    if (editingTriggerId) {
      await onUpdateTrigger(editingTriggerId, payload);
    } else {
      await onCreateTrigger(payload);
    }

    resetTriggerForm(effectiveTriggerRepeatableRunId);
  }

  function toggleRequestMatching(enabled: boolean) {
    setEnableRequestMatching(enabled);
    if (!enabled) {
      setAllowPost(true);
      setAllowPut(false);
      setMaxPayloadBytes(String(DEFAULT_MAX_PAYLOAD_BYTES));
    }
  }

  function toggleSecurity(enabled: boolean) {
    setEnableSecurity(enabled);
    if (!enabled) {
      setSecretRef("");
      setSignatureHeader("");
    }
  }

  function toggleEventMatching(enabled: boolean) {
    setEnableEventMatching(enabled);
    if (!enabled) {
      setFilterEventNames("");
      setFilterActions("");
      setFilterBranches("");
      setEventNameHeader("");
    } else if (effectiveTriggerShape === "github" && !eventNameHeader) {
      setEventNameHeader(GITHUB_EVENT_HEADER);
    }
  }

  function toggleDeliveryMetadata(enabled: boolean) {
    setEnableDeliveryMetadata(enabled);
    if (!enabled) {
      setDeliveryIdHeader("");
    } else if (effectiveTriggerShape === "github" && !deliveryIdHeader) {
      setDeliveryIdHeader(GITHUB_DELIVERY_HEADER);
    }
  }

  function applyTriggerShape(nextShape: WebhookShape) {
    setTriggerShape(nextShape);

    if (nextShape === "github") {
      if (!eventNameHeader) {
        setEventNameHeader(GITHUB_EVENT_HEADER);
      }
      if (!deliveryIdHeader) {
        setDeliveryIdHeader(GITHUB_DELIVERY_HEADER);
      }
    }
  }

  return (
    <section className="control-card repeatable-run-card is-open">
      <div className="control-card-header">
        <div className="control-card-heading">
          <strong>Project automation</strong>
          <span>Repeatable runs and webhook triggers</span>
        </div>
      </div>

      <label className="control-field">
        <span>Repository</span>
        <select
          value={selectedRepositoryId}
          onChange={(event) => onSelectedRepositoryIdChange(event.target.value)}
        >
          <option value="">Select repository</option>
          {repositories.map((repository) => (
            <option key={repository.id} value={repository.id}>
              {repository.name}
            </option>
          ))}
        </select>
      </label>

      <div className="repeatable-run-layout">
        <div className="repeatable-run-column">
          <div className="repeatable-run-form">
            <div className="repeatable-run-section-header">
              <strong>
                {editingDefinitionId
                  ? "Edit repeatable run"
                  : "Create repeatable run"}
              </strong>
              {editingDefinitionId ? (
                <button
                  type="button"
                  className="table-action"
                  onClick={resetDefinitionForm}
                  disabled={actionPending}
                >
                  Cancel
                </button>
              ) : null}
            </div>
            <label className="control-field">
              <span>Project team</span>
              <select
                value={definitionProjectTeamId}
                onChange={(event) =>
                  setDefinitionProjectTeamId(event.target.value)
                }
              >
                <option value="">Select project team</option>
                {projectTeams.map((projectTeam) => (
                  <option key={projectTeam.id} value={projectTeam.id}>
                    {projectTeam.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="control-field">
              <span>Name</span>
              <input
                value={definitionName}
                onChange={(event) => setDefinitionName(event.target.value)}
              />
            </label>
            <label className="control-field">
              <span>Description</span>
              <textarea
                rows={3}
                value={definitionDescription}
                onChange={(event) =>
                  setDefinitionDescription(event.target.value)
                }
              />
            </label>
            <label className="control-field">
              <span>Status</span>
              <select
                value={definitionStatus}
                onChange={(event) =>
                  setDefinitionStatus(
                    event.target.value as RepeatableRunDefinition["status"],
                  )
                }
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="disabled">Disabled</option>
              </select>
            </label>
            <label className="control-field">
              <span>Run goal</span>
              <textarea
                rows={4}
                value={definitionGoal}
                onChange={(event) => setDefinitionGoal(event.target.value)}
              />
            </label>
            <div className="repeatable-run-grid">
              <label className="control-field">
                <span>Branch</span>
                <input
                  value={definitionBranchName}
                  onChange={(event) =>
                    setDefinitionBranchName(event.target.value)
                  }
                />
              </label>
              <label className="control-field">
                <span>Concurrency</span>
                <input
                  type="number"
                  min={1}
                  value={definitionConcurrencyCap}
                  onChange={(event) =>
                    setDefinitionConcurrencyCap(event.target.value)
                  }
                />
              </label>
            </div>
            <div className="repeatable-run-grid">
              <label className="control-field">
                <span>Plan artifact path</span>
                <input
                  value={definitionPlanArtifactPath}
                  onChange={(event) =>
                    setDefinitionPlanArtifactPath(event.target.value)
                  }
                />
              </label>
              <label className="control-field">
                <span>Policy profile</span>
                <input
                  value={definitionPolicyProfile}
                  onChange={(event) =>
                    setDefinitionPolicyProfile(event.target.value)
                  }
                />
              </label>
            </div>
            <button
              type="button"
              className="action-button"
              onClick={() => void handleDefinitionSubmit()}
              disabled={
                actionPending ||
                !selectedRepositoryId ||
                !definitionProjectTeamId
              }
            >
              {editingDefinitionId
                ? "Save repeatable run"
                : "Create repeatable run"}
            </button>
          </div>

          <div className="repeatable-run-list">
            {scopedDefinitions.map((definition) => {
              const definitionTriggers = scopedTriggers.filter(
                (trigger) => trigger.repeatableRunId === definition.id,
              );
              return (
                <article key={definition.id} className="repeatable-run-item">
                  <div className="repeatable-run-item-header">
                    <div>
                      <strong>{definition.name}</strong>
                      <p>{definition.description ?? "No description set."}</p>
                    </div>
                    <span
                      className={`tone-chip tone-${definition.status === "active" ? "success" : definition.status === "paused" ? "warning" : "muted"}`}
                    >
                      {formatLabel(definition.status)}
                    </span>
                  </div>
                  <p className="repeatable-run-meta">
                    {summarizeExecution(definition)}
                  </p>
                  <div className="repeatable-run-action-row">
                    <button
                      type="button"
                      className="table-action"
                      onClick={() => {
                        setEditingDefinitionId(definition.id);
                        setDefinitionName(definition.name);
                        setDefinitionDescription(definition.description ?? "");
                        setDefinitionProjectTeamId(
                          definition.projectTeamId ?? "",
                        );
                        setDefinitionStatus(definition.status);
                        setDefinitionGoal(definition.execution.goal);
                        setDefinitionBranchName(
                          definition.execution.branchName ?? "",
                        );
                        setDefinitionPlanArtifactPath(
                          definition.execution.planArtifactPath ?? "",
                        );
                        setDefinitionConcurrencyCap(
                          String(definition.execution.concurrencyCap),
                        );
                        setDefinitionPolicyProfile(
                          definition.execution.policyProfile ?? "",
                        );
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="table-action"
                      onClick={() => {
                        resetTriggerForm(definition.id);
                        setTriggerName(`${definition.name} webhook`);
                      }}
                    >
                      Add trigger
                    </button>
                    <button
                      type="button"
                      className="table-action table-action-danger"
                      onClick={() => void onDeleteDefinition(definition)}
                      disabled={actionPending || definitionTriggers.length > 0}
                      title={
                        definitionTriggers.length > 0
                          ? "Delete linked triggers first."
                          : undefined
                      }
                    >
                      Delete
                    </button>
                  </div>
                </article>
              );
            })}
            {projectTeams.length === 0 ? (
              <p className="inventory-empty">
                Import or create a project team before configuring repeatable
                runs.
              </p>
            ) : null}
            {projectTeams.length > 0 && scopedDefinitions.length === 0 ? (
              <p className="inventory-empty">
                No repeatable runs configured for this project yet.
              </p>
            ) : null}
          </div>
        </div>

        <div className="repeatable-run-column">
          <div className="repeatable-run-form">
            <div className="repeatable-run-section-header">
              <strong>
                {editingTriggerId
                  ? "Edit webhook trigger"
                  : "Create webhook trigger"}
              </strong>
              {editingTriggerId ? (
                <button
                  type="button"
                  className="table-action"
                  onClick={() => resetTriggerForm()}
                  disabled={actionPending}
                >
                  Cancel
                </button>
              ) : null}
            </div>

            <div className="repeatable-run-shape-row">
              <span className="repeatable-run-shape-label">Webhook shape</span>
              <div className="repeatable-run-pill-row">
                <button
                  type="button"
                  className={`ghost-pill ${effectiveTriggerShape === "generic" ? "is-active" : ""}`}
                  onClick={() => applyTriggerShape("generic")}
                >
                  Generic webhook
                </button>
                <button
                  type="button"
                  className={`ghost-pill ${effectiveTriggerShape === "github" ? "is-active" : ""}`}
                  onClick={() => applyTriggerShape("github")}
                >
                  GitHub webhook
                </button>
              </div>
            </div>

            <label className="control-field">
              <span>Repeatable run</span>
              <select
                value={effectiveTriggerRepeatableRunId}
                onChange={(event) =>
                  setTriggerRepeatableRunId(event.target.value)
                }
              >
                <option value="">Select repeatable run</option>
                {scopedDefinitions.map((definition) => (
                  <option key={definition.id} value={definition.id}>
                    {definition.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="control-field">
              <span>Trigger name</span>
              <input
                value={triggerName}
                onChange={(event) => setTriggerName(event.target.value)}
              />
            </label>
            <label className="control-field">
              <span>Description</span>
              <textarea
                rows={3}
                value={triggerDescription}
                onChange={(event) => setTriggerDescription(event.target.value)}
              />
            </label>

            <div className="repeatable-run-generated-endpoint">
              <div className="repeatable-run-section-header">
                <div>
                  <strong>Endpoint</strong>
                  <p>
                    The system assigns a unique inbound path. You only need to
                    copy it into the upstream webhook configuration.
                  </p>
                </div>
                <button
                  type="button"
                  className="table-action"
                  onClick={() => void handleCopyEndpoint()}
                  disabled={
                    displayedEndpointPath === GENERATED_ENDPOINT_PLACEHOLDER
                  }
                >
                  {endpointCopied ? "Copied" : "Copy"}
                </button>
              </div>
              <div className="repeatable-run-code-block">
                <code>{displayedEndpointPath}</code>
              </div>
            </div>

            <div className="repeatable-run-optional-tools">
              <strong>Optional controls</strong>
              <p>
                {effectiveTriggerShape === "github"
                  ? "GitHub shape suggests event matching and delivery metadata, but both stay optional."
                  : "Enable only the constraints you actually need."}
              </p>
              <div className="repeatable-run-pill-grid">
                <button
                  type="button"
                  className={`ghost-pill ${enableRequestMatching ? "is-active" : ""}`}
                  onClick={() => toggleRequestMatching(!enableRequestMatching)}
                >
                  Request matching
                </button>
                <button
                  type="button"
                  className={`ghost-pill ${enableSecurity ? "is-active" : ""}`}
                  onClick={() => toggleSecurity(!enableSecurity)}
                >
                  Security
                </button>
                <button
                  type="button"
                  className={`ghost-pill ${enableEventMatching ? "is-active" : ""}`}
                  onClick={() => toggleEventMatching(!enableEventMatching)}
                >
                  Event matching
                </button>
                <button
                  type="button"
                  className={`ghost-pill ${enableDeliveryMetadata ? "is-active" : ""}`}
                  onClick={() =>
                    toggleDeliveryMetadata(!enableDeliveryMetadata)
                  }
                >
                  Delivery metadata
                </button>
              </div>
            </div>

            {enableRequestMatching ? (
              <section className="repeatable-run-subsection">
                <div className="repeatable-run-section-header">
                  <strong>Request matching</strong>
                </div>
                <div className="repeatable-run-toggle-row">
                  <label className="repeatable-run-checkbox">
                    <input
                      type="checkbox"
                      checked={allowPost}
                      onChange={(event) => setAllowPost(event.target.checked)}
                    />
                    <span>POST</span>
                  </label>
                  <label className="repeatable-run-checkbox">
                    <input
                      type="checkbox"
                      checked={allowPut}
                      onChange={(event) => setAllowPut(event.target.checked)}
                    />
                    <span>PUT</span>
                  </label>
                </div>
                <label className="control-field">
                  <span>Max payload bytes</span>
                  <input
                    type="number"
                    min={1}
                    value={maxPayloadBytes}
                    onChange={(event) => setMaxPayloadBytes(event.target.value)}
                  />
                </label>
              </section>
            ) : null}

            {enableSecurity ? (
              <section className="repeatable-run-subsection">
                <div className="repeatable-run-section-header">
                  <strong>Security</strong>
                </div>
                <div className="repeatable-run-grid">
                  <label className="control-field">
                    <span>Secret env ref</span>
                    <input
                      value={secretRef}
                      onChange={(event) => setSecretRef(event.target.value)}
                      placeholder="WEBHOOK_SHARED_SECRET"
                    />
                  </label>
                  <label className="control-field">
                    <span>Signature header</span>
                    <input
                      value={signatureHeader}
                      onChange={(event) =>
                        setSignatureHeader(event.target.value)
                      }
                      placeholder="x-codex-signature"
                    />
                  </label>
                </div>
              </section>
            ) : null}

            {enableEventMatching ? (
              <section className="repeatable-run-subsection">
                <div className="repeatable-run-section-header">
                  <strong>Event matching</strong>
                </div>
                <label className="control-field">
                  <span>Event name header</span>
                  <input
                    value={eventNameHeader}
                    onChange={(event) => setEventNameHeader(event.target.value)}
                    placeholder={
                      effectiveTriggerShape === "github"
                        ? GITHUB_EVENT_HEADER
                        : "x-event-name"
                    }
                  />
                </label>
                <div className="repeatable-run-grid">
                  <label className="control-field">
                    <span>Accepted events</span>
                    <input
                      value={filterEventNames}
                      onChange={(event) =>
                        setFilterEventNames(event.target.value)
                      }
                      placeholder={
                        effectiveTriggerShape === "github"
                          ? "pull_request, issues"
                          : "build.completed, deployment.finished"
                      }
                    />
                  </label>
                  <label className="control-field">
                    <span>Accepted actions</span>
                    <input
                      value={filterActions}
                      onChange={(event) => setFilterActions(event.target.value)}
                      placeholder={
                        effectiveTriggerShape === "github"
                          ? "opened, reopened"
                          : "created, updated"
                      }
                    />
                  </label>
                </div>
                <label className="control-field">
                  <span>Accepted branches</span>
                  <input
                    value={filterBranches}
                    onChange={(event) => setFilterBranches(event.target.value)}
                    placeholder="main, release/*"
                  />
                </label>
              </section>
            ) : null}

            {enableDeliveryMetadata ? (
              <section className="repeatable-run-subsection">
                <div className="repeatable-run-section-header">
                  <strong>Delivery metadata</strong>
                </div>
                <label className="control-field">
                  <span>Delivery ID header</span>
                  <input
                    value={deliveryIdHeader}
                    onChange={(event) =>
                      setDeliveryIdHeader(event.target.value)
                    }
                    placeholder={
                      effectiveTriggerShape === "github"
                        ? GITHUB_DELIVERY_HEADER
                        : "x-delivery-id"
                    }
                  />
                </label>
              </section>
            ) : null}

            <label className="repeatable-run-checkbox">
              <input
                type="checkbox"
                checked={triggerEnabled}
                onChange={(event) => setTriggerEnabled(event.target.checked)}
              />
              <span>Enabled</span>
            </label>

            <button
              type="button"
              className="action-button"
              onClick={() => void handleTriggerSubmit()}
              disabled={actionPending || !effectiveTriggerRepeatableRunId}
            >
              {editingTriggerId
                ? "Save webhook trigger"
                : "Create webhook trigger"}
            </button>
          </div>

          <div className="repeatable-run-list">
            {scopedTriggers.map((trigger) => {
              const triggerReceipts = scopedReceipts
                .filter(
                  (receipt) => receipt.repeatableRunTriggerId === trigger.id,
                )
                .sort(
                  (left, right) =>
                    new Date(right.updatedAt).getTime() -
                    new Date(left.updatedAt).getTime(),
                );
              const latestReceipt = triggerReceipts[0] ?? null;
              const definition =
                scopedDefinitions.find(
                  (item) => item.id === trigger.repeatableRunId,
                ) ?? null;
              const statusTone = !trigger.enabled
                ? "muted"
                : latestReceipt?.status === "failed" ||
                    latestReceipt?.status === "rejected"
                  ? "danger"
                  : latestReceipt?.status === "run_created"
                    ? "success"
                    : "warning";

              return (
                <article
                  key={trigger.id}
                  className="repeatable-run-item repeatable-run-trigger-item"
                >
                  <div className="repeatable-run-item-header">
                    <div>
                      <strong>{trigger.name}</strong>
                      <p>{definition?.name ?? "Unknown repeatable run"}</p>
                    </div>
                    <span className={`tone-chip tone-${statusTone}`}>
                      {!trigger.enabled
                        ? "Disabled"
                        : latestReceipt
                          ? formatLabel(latestReceipt.status)
                          : "Waiting"}
                    </span>
                  </div>

                  <div className="repeatable-run-code-block">
                    <code>{trigger.config.endpointPath}</code>
                    <span>{trigger.config.allowedMethods.join(", ")}</span>
                  </div>

                  {latestReceipt ? (
                    <p className="repeatable-run-meta">
                      Last delivery {formatDateTime(latestReceipt.updatedAt)}
                      {latestReceipt.rejectionReason
                        ? ` · ${latestReceipt.rejectionReason}`
                        : ""}
                    </p>
                  ) : (
                    <p className="repeatable-run-meta">
                      No webhook deliveries recorded yet.
                    </p>
                  )}

                  <div className="repeatable-run-context">
                    <strong>Run context mapping</strong>
                    {describeEventContext(trigger).map((line) => (
                      <span key={line}>{line}</span>
                    ))}
                  </div>

                  <div className="repeatable-run-action-row">
                    <button
                      type="button"
                      className="table-action"
                      onClick={() => {
                        const nextShape = inferTriggerShape(
                          selectedRepository,
                          trigger,
                        );
                        setEditingTriggerId(trigger.id);
                        setTriggerRepeatableRunId(trigger.repeatableRunId);
                        setTriggerName(trigger.name);
                        setTriggerDescription(trigger.description ?? "");
                        setTriggerEnabled(trigger.enabled);
                        setTriggerShape(nextShape);
                        setResolvedEndpointPath(trigger.config.endpointPath);
                        setSecretRef(trigger.config.secretRef ?? "");
                        setSignatureHeader(
                          trigger.config.signatureHeader ?? "",
                        );
                        setEventNameHeader(
                          trigger.config.eventNameHeader ?? "",
                        );
                        setDeliveryIdHeader(
                          trigger.config.deliveryIdHeader ?? "",
                        );
                        setMaxPayloadBytes(
                          String(trigger.config.maxPayloadBytes),
                        );
                        setAllowPost(
                          trigger.config.allowedMethods.includes("POST"),
                        );
                        setAllowPut(
                          trigger.config.allowedMethods.includes("PUT"),
                        );
                        setFilterEventNames(
                          trigger.config.filters.eventNames.join(", "),
                        );
                        setFilterActions(
                          trigger.config.filters.actions.join(", "),
                        );
                        setFilterBranches(
                          trigger.config.filters.branches.join(", "),
                        );
                        setEnableRequestMatching(
                          trigger.config.maxPayloadBytes !==
                            DEFAULT_MAX_PAYLOAD_BYTES ||
                            trigger.config.allowedMethods.length !== 1 ||
                            !trigger.config.allowedMethods.includes("POST"),
                        );
                        setEnableSecurity(
                          Boolean(
                            trigger.config.secretRef ||
                            trigger.config.signatureHeader,
                          ),
                        );
                        setEnableEventMatching(
                          Boolean(
                            trigger.config.eventNameHeader ||
                            trigger.config.filters.eventNames.length > 0 ||
                            trigger.config.filters.actions.length > 0 ||
                            trigger.config.filters.branches.length > 0,
                          ),
                        );
                        setEnableDeliveryMetadata(
                          Boolean(trigger.config.deliveryIdHeader),
                        );
                        setEndpointCopied(false);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="table-action table-action-danger"
                      onClick={() => void onDeleteTrigger(trigger)}
                      disabled={actionPending || triggerReceipts.length > 0}
                      title={
                        triggerReceipts.length > 0
                          ? "Triggers with received events are kept for auditability."
                          : undefined
                      }
                    >
                      Delete
                    </button>
                  </div>

                  {triggerReceipts.length > 0 ? (
                    <div className="repeatable-run-receipt-list">
                      {triggerReceipts.slice(0, 3).map((receipt) => (
                        <div
                          key={receipt.id}
                          className="repeatable-run-receipt"
                        >
                          <span>{formatDateTime(receipt.createdAt)}</span>
                          <span>{formatLabel(receipt.status)}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}
            {scopedTriggers.length === 0 ? (
              <p className="inventory-empty">
                No webhook triggers configured for this project yet.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {errorText ? <p className="control-error">{errorText}</p> : null}
    </section>
  );
}
