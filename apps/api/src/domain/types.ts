export const runStatuses = [
  "pending",
  "planning",
  "in_progress",
  "awaiting_approval",
  "completed",
  "failed",
  "cancelled",
] as const;
export const taskStatuses = [
  "pending",
  "blocked",
  "in_progress",
  "awaiting_review",
  "completed",
  "failed",
  "cancelled",
] as const;
export const approvalStatuses = ["pending", "approved", "rejected"] as const;
export const artifactKinds = [
  "plan",
  "patch",
  "log",
  "report",
  "diff",
  "screenshot",
  "pr_link",
  "other",
] as const;
export const validationStatuses = ["pending", "passed", "failed"] as const;
export const agentStatuses = [
  "provisioning",
  "idle",
  "busy",
  "paused",
  "stopped",
  "failed",
] as const;
export const messageKinds = ["direct", "broadcast", "system"] as const;

export type RunStatus = (typeof runStatuses)[number];
export type TaskStatus = (typeof taskStatuses)[number];
export type ApprovalStatus = (typeof approvalStatuses)[number];
export type ArtifactKind = (typeof artifactKinds)[number];
export type ValidationStatus = (typeof validationStatuses)[number];
export type AgentStatus = (typeof agentStatuses)[number];
export type MessageKind = (typeof messageKinds)[number];
