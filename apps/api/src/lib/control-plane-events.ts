import type {
  ControlPlaneEventEntityType,
  ControlPlaneEventType
} from "@codex-swarm/contracts";

export const controlPlaneEvents = {
  adminGovernanceReportGenerated: {
    eventType: "admin.governance_report_generated",
    entityType: "admin_report"
  },
  adminRetentionReconciled: {
    eventType: "admin.retention_reconciled",
    entityType: "retention_policy"
  },
  agentCreated: {
    eventType: "agent.created",
    entityType: "agent"
  },
  approvalCreated: {
    eventType: "approval.created",
    entityType: "approval"
  },
  approvalResolved: {
    eventType: "approval.resolved",
    entityType: "approval"
  },
  artifactCreated: {
    eventType: "artifact.created",
    entityType: "artifact"
  },
  maintenanceCleanupCompleted: {
    eventType: "maintenance.cleanup_completed",
    entityType: "cleanup_job"
  },
  messageCreated: {
    eventType: "message.created",
    entityType: "message"
  },
  repositoryCreated: {
    eventType: "repository.created",
    entityType: "repository"
  },
  runAuditExported: {
    eventType: "run.audit_exported",
    entityType: "run"
  },
  runBranchPublished: {
    eventType: "run.branch_published",
    entityType: "run"
  },
  runCompleted: {
    eventType: "run.completed",
    entityType: "run"
  },
  runCreated: {
    eventType: "run.created",
    entityType: "run"
  },
  runPullRequestHandoffCreated: {
    eventType: "run.pull_request_handoff_created",
    entityType: "run"
  },
  runStatusUpdated: {
    eventType: "run.status_updated",
    entityType: "run"
  },
  taskCreated: {
    eventType: "task.created",
    entityType: "task"
  },
  taskStatusUpdated: {
    eventType: "task.status_updated",
    entityType: "task"
  },
  taskVerificationRequested: {
    eventType: "task.verification_requested",
    entityType: "task"
  },
  taskVerificationPassed: {
    eventType: "task.verification_passed",
    entityType: "task"
  },
  taskVerificationFailed: {
    eventType: "task.verification_failed",
    entityType: "task"
  },
  taskVerificationBlocked: {
    eventType: "task.verification_blocked",
    entityType: "task"
  },
  taskUnblocked: {
    eventType: "task.unblocked",
    entityType: "task"
  },
  validationCreated: {
    eventType: "validation.created",
    entityType: "validation"
  },
  workerDispatchAssignmentClaimed: {
    eventType: "worker_dispatch_assignment.claimed",
    entityType: "worker_dispatch_assignment"
  },
  workerDispatchAssignmentCreated: {
    eventType: "worker_dispatch_assignment.created",
    entityType: "worker_dispatch_assignment"
  },
  workerDispatchAssignmentUpdated: {
    eventType: "worker_dispatch_assignment.updated",
    entityType: "worker_dispatch_assignment"
  },
  workerNodeDrainStateUpdated: {
    eventType: "worker_node.drain_state_updated",
    entityType: "worker_node"
  },
  workerNodeHeartbeatRecorded: {
    eventType: "worker_node.heartbeat_recorded",
    entityType: "worker_node"
  },
  workerNodeReconciled: {
    eventType: "worker_node.reconciled",
    entityType: "worker_node"
  },
  workerNodeRegistered: {
    eventType: "worker_node.registered",
    entityType: "worker_node"
  }
} as const satisfies Record<string, {
  eventType: ControlPlaneEventType;
  entityType: ControlPlaneEventEntityType;
}>;

export function timelineEvent(
  definition: { eventType: ControlPlaneEventType; entityType: ControlPlaneEventEntityType },
  input: {
    entityId: string;
    runId?: string | null;
    taskId?: string | null;
    agentId?: string | null;
    status: string;
    summary: string;
    metadata?: Record<string, unknown>;
  }
) {
  return {
    ...definition,
    ...input
  };
}
