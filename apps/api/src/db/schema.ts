import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp
} from "drizzle-orm/pg-core";

export const repositories = pgTable("repositories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  provider: text("provider").notNull().default("other"),
  defaultBranch: text("default_branch").notNull(),
  localPath: text("local_path"),
  trustLevel: text("trust_level").notNull().default("trusted"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const runs = pgTable("runs", {
  id: text("id").primaryKey(),
  repositoryId: text("repository_id").notNull().references(() => repositories.id),
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
  pullRequestUrl: text("pull_request_url"),
  pullRequestNumber: integer("pull_request_number"),
  pullRequestStatus: text("pull_request_status"),
  handoffStatus: text("handoff_status").notNull().default("pending"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdBy: text("created_by").notNull(),
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

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull().references(() => agents.id),
  threadId: text("thread_id").notNull(),
  cwd: text("cwd").notNull(),
  sandbox: text("sandbox").notNull(),
  approvalPolicy: text("approval_policy").notNull(),
  includePlanTool: boolean("include_plan_tool").notNull().default(false),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
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
  taskId: text("task_id"),
  kind: text("kind").notNull(),
  status: text("status").notNull(),
  requestedPayload: jsonb("requested_payload").$type<Record<string, unknown>>().notNull().default({}),
  resolutionPayload: jsonb("resolution_payload").$type<Record<string, unknown>>().notNull().default({}),
  requestedBy: text("requested_by").notNull(),
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
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
