import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp
} from "drizzle-orm/pg-core";
import type { ActorIdentity } from "@codex-swarm/contracts";

export const repositories = pgTable("repositories", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  teamId: text("team_id").notNull(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  provider: text("provider").notNull().default("other"),
  defaultBranch: text("default_branch").notNull(),
  localPath: text("local_path"),
  trustLevel: text("trust_level").notNull().default("trusted"),
  approvalProfile: text("approval_profile").notNull().default("standard"),
  providerSync: jsonb("provider_sync").$type<{
    connectivityStatus: "validated" | "failed" | "skipped";
    validatedAt: string | null;
    defaultBranch: string | null;
    branches: string[];
    providerRepoUrl: string | null;
    lastError: string | null;
  }>().notNull().default({
    connectivityStatus: "skipped",
    validatedAt: null,
    defaultBranch: null,
    branches: [],
    providerRepoUrl: null,
    lastError: null
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const runs = pgTable("runs", {
  id: text("id").primaryKey(),
  repositoryId: text("repository_id").notNull().references(() => repositories.id),
  workspaceId: text("workspace_id").notNull(),
  teamId: text("team_id").notNull(),
  goal: text("goal").notNull(),
  status: text("status").notNull(),
  branchName: text("branch_name"),
  planArtifactPath: text("plan_artifact_path"),
  budgetTokens: integer("budget_tokens"),
  budgetCostUsd: integer("budget_cost_usd_cents"),
  concurrencyCap: integer("concurrency_cap").notNull().default(1),
  policyProfile: text("policy_profile"),
  publishedBranch: text("published_branch"),
  branchPublishedAt: timestamp("branch_published_at", { withTimezone: true }),
  branchPublishApprovalId: text("branch_publish_approval_id"),
  pullRequestUrl: text("pull_request_url"),
  pullRequestNumber: integer("pull_request_number"),
  pullRequestStatus: text("pull_request_status"),
  pullRequestApprovalId: text("pull_request_approval_id"),
  handoffStatus: text("handoff_status").notNull().default("pending"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  context: jsonb("context").$type<Record<string, unknown>>().notNull().default({
    externalInput: null,
    values: {}
  }),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const repeatableRunDefinitions = pgTable("repeatable_run_definitions", {
  id: text("id").primaryKey(),
  repositoryId: text("repository_id").notNull().references(() => repositories.id),
  workspaceId: text("workspace_id").notNull(),
  teamId: text("team_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull(),
  execution: jsonb("execution").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const repeatableRunTriggers = pgTable("repeatable_run_triggers", {
  id: text("id").primaryKey(),
  repeatableRunId: text("repeatable_run_id").notNull().references(() => repeatableRunDefinitions.id),
  workspaceId: text("workspace_id").notNull(),
  teamId: text("team_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  enabled: boolean("enabled").notNull().default(true),
  kind: text("kind").notNull(),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const externalEventReceipts = pgTable("external_event_receipts", {
  id: text("id").primaryKey(),
  repeatableRunTriggerId: text("repeatable_run_trigger_id").notNull().references(() => repeatableRunTriggers.id),
  repeatableRunId: text("repeatable_run_id").notNull().references(() => repeatableRunDefinitions.id),
  repositoryId: text("repository_id").notNull().references(() => repositories.id),
  workspaceId: text("workspace_id").notNull(),
  teamId: text("team_id").notNull(),
  sourceType: text("source_type").notNull(),
  status: text("status").notNull(),
  event: jsonb("event").$type<Record<string, unknown>>().notNull().default({}),
  rejectionReason: text("rejection_reason"),
  createdRunId: text("created_run_id").references(() => runs.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const tasks = pgTable("tasks", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull().references(() => runs.id),
  parentTaskId: text("parent_task_id"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  role: text("role").notNull(),
  status: text("status").notNull(),
  priority: integer("priority").notNull().default(3),
  ownerAgentId: text("owner_agent_id"),
  dependencyIds: jsonb("dependency_ids").$type<string[]>().notNull().default([]),
  acceptanceCriteria: jsonb("acceptance_criteria").$type<string[]>().notNull().default([]),
  validationTemplates: jsonb("validation_templates").$type<Array<{
    name: string;
    command: string;
    summary?: string;
    artifactPath?: string;
  }>>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const agents = pgTable("agents", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull().references(() => runs.id),
  name: text("name").notNull(),
  role: text("role").notNull(),
  status: text("status").notNull(),
  worktreePath: text("worktree_path"),
  branchName: text("branch_name"),
  currentTaskId: text("current_task_id"),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const workerNodes = pgTable("worker_nodes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  endpoint: text("endpoint"),
  capabilityLabels: jsonb("capability_labels").$type<string[]>().notNull().default([]),
  status: text("status").notNull().default("online"),
  drainState: text("drain_state").notNull().default("active"),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull().references(() => agents.id),
  threadId: text("thread_id").notNull(),
  cwd: text("cwd").notNull(),
  sandbox: text("sandbox").notNull(),
  approvalPolicy: text("approval_policy").notNull(),
  includePlanTool: boolean("include_plan_tool").notNull().default(false),
  workerNodeId: text("worker_node_id").references(() => workerNodes.id),
  stickyNodeId: text("sticky_node_id").references(() => workerNodes.id),
  placementConstraintLabels: jsonb("placement_constraint_labels").$type<string[]>().notNull().default([]),
  lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
  state: text("state").notNull().default("active"),
  staleReason: text("stale_reason"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const workerDispatchAssignments = pgTable("worker_dispatch_assignments", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull().references(() => runs.id),
  taskId: text("task_id").notNull().references(() => tasks.id),
  agentId: text("agent_id").notNull().references(() => agents.id),
  sessionId: text("session_id").references(() => sessions.id),
  repositoryId: text("repository_id").notNull().references(() => repositories.id),
  repositoryName: text("repository_name").notNull(),
  queue: text("queue").notNull().default("worker-dispatch"),
  state: text("state").notNull().default("queued"),
  stickyNodeId: text("sticky_node_id").references(() => workerNodes.id),
  preferredNodeId: text("preferred_node_id").references(() => workerNodes.id),
  claimedByNodeId: text("claimed_by_node_id").references(() => workerNodes.id),
  requiredCapabilities: jsonb("required_capabilities").$type<string[]>().notNull().default([]),
  worktreePath: text("worktree_path").notNull(),
  branchName: text("branch_name"),
  prompt: text("prompt").notNull(),
  profile: text("profile").notNull(),
  sandbox: text("sandbox").notNull(),
  approvalPolicy: text("approval_policy").notNull(),
  includePlanTool: boolean("include_plan_tool").notNull().default(false),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  attempt: integer("attempt").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  leaseTtlSeconds: integer("lease_ttl_seconds").notNull().default(300),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  lastFailureReason: text("last_failure_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const messages = pgTable("messages", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull().references(() => runs.id),
  senderAgentId: text("sender_agent_id"),
  recipientAgentId: text("recipient_agent_id"),
  kind: text("kind").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const approvals = pgTable("approvals", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull().references(() => runs.id),
  workspaceId: text("workspace_id").notNull(),
  teamId: text("team_id").notNull(),
  taskId: text("task_id"),
  kind: text("kind").notNull(),
  status: text("status").notNull(),
  requestedPayload: jsonb("requested_payload").$type<Record<string, unknown>>().notNull().default({}),
  resolutionPayload: jsonb("resolution_payload").$type<Record<string, unknown>>().notNull().default({}),
  requestedBy: text("requested_by").notNull(),
  delegateActorId: text("delegate_actor_id"),
  delegatedBy: text("delegated_by"),
  delegatedAt: timestamp("delegated_at", { withTimezone: true }),
  delegationReason: text("delegation_reason"),
  resolver: text("resolver"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const validations = pgTable("validations", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull().references(() => runs.id),
  taskId: text("task_id"),
  name: text("name").notNull(),
  status: text("status").notNull(),
  command: text("command").notNull(),
  summary: text("summary"),
  artifactPath: text("artifact_path"),
  artifactIds: jsonb("artifact_ids").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const artifacts = pgTable("artifacts", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull().references(() => runs.id),
  taskId: text("task_id"),
  kind: text("kind").notNull(),
  path: text("path").notNull(),
  contentType: text("content_type").notNull(),
  url: text("url"),
  sizeBytes: integer("size_bytes"),
  sha256: text("sha256"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const controlPlaneEvents = pgTable("control_plane_events", {
  id: text("id").primaryKey(),
  runId: text("run_id").references(() => runs.id),
  taskId: text("task_id"),
  agentId: text("agent_id"),
  traceId: text("trace_id").notNull(),
  eventType: text("event_type").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  status: text("status").notNull(),
  summary: text("summary").notNull(),
  actor: jsonb("actor").$type<ActorIdentity | null>().default(null),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const teams = pgTable("teams", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  name: text("name").notNull(),
  policyProfile: text("policy_profile").notNull().default("standard"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
