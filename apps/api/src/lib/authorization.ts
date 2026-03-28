import type { ActorIdentity, GovernedAction, GovernanceRole } from "@codex-swarm/contracts";

import { HttpError } from "./http-error.js";

const permissionMatrix: Record<GovernanceRole, GovernedAction[]> = {
  org_admin: ["run.create", "run.review", "run.retry", "run.stop", "approval.request", "approval.resolve", "admin.read", "admin.write"],
  workspace_admin: ["run.create", "run.review", "run.retry", "run.stop", "approval.request", "approval.resolve", "admin.read", "admin.write"],
  team_admin: ["run.create", "run.review", "run.retry", "run.stop", "approval.request", "approval.resolve", "admin.read"],
  member: ["run.create", "approval.request"],
  reviewer: ["run.review", "approval.resolve"],
  operator: ["run.retry", "run.stop"],
  service: [],
  system: ["run.create", "run.review", "run.retry", "run.stop", "approval.request", "approval.resolve", "admin.read", "admin.write"]
};

export function getActorRoles(actor: Pick<ActorIdentity, "role" | "roles">): GovernanceRole[] {
  return [...new Set([actor.role, ...actor.roles])] as GovernanceRole[];
}

export function canActorPerformAction(actor: Pick<ActorIdentity, "role" | "roles">, action: GovernedAction) {
  return getActorRoles(actor).some((role) => permissionMatrix[role]?.includes(action));
}

export function requireAuthorizedAction(actor: Pick<ActorIdentity, "role" | "roles" | "workspaceId" | "teamId">, action: GovernedAction) {
  if (canActorPerformAction(actor, action)) {
    return;
  }

  throw new HttpError(403, `actor role is not permitted to perform ${action}`, {
    action,
    roles: getActorRoles(actor),
    workspaceId: actor.workspaceId ?? null,
    teamId: actor.teamId ?? null
  });
}
