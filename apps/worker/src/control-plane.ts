import { isAbsolute, resolve } from "node:path";

import type {
  Repository,
  RemoteWorkerBootstrap,
  RunDetail,
  WorkerDispatchAssignment,
  WorkerNodeRuntime
} from "@codex-swarm/contracts";

import { buildRemoteWorkerBootstrap } from "./dispatch.js";
import {
  type MaterializedRepositoryWorkspace,
  materializeRepositoryWorkspace,
  resolveWorkspaceProvisioningMode
} from "./runtime.js";

export interface WorkerControlPlaneClientConfig {
  baseUrl: string;
  authToken?: string;
  fetchImpl?: typeof fetch;
}

export interface ClaimAndProvisionDispatchInput {
  runtime: WorkerNodeRuntime;
  controlPlane: WorkerControlPlaneClientConfig;
  nodeId?: string;
}

export interface ClaimedDispatchWorkspace {
  assignment: WorkerDispatchAssignment;
  run: RunDetail;
  repository: Repository;
  workspace: MaterializedRepositoryWorkspace;
  bootstrap: RemoteWorkerBootstrap;
}

function buildHeaders(authToken?: string) {
  return {
    Accept: "application/json",
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
  };
}

async function requestJson<T>(
  client: WorkerControlPlaneClientConfig,
  method: string,
  path: string
): Promise<T> {
  const fetchImpl = client.fetchImpl ?? fetch;
  const response = await fetchImpl(new URL(path, client.baseUrl), {
    method,
    headers: buildHeaders(client.authToken)
  });

  if (!response.ok) {
    throw new Error(`${method} ${path} failed with ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

function resolveWorktreePath(runtime: WorkerNodeRuntime, assignment: WorkerDispatchAssignment) {
  if (isAbsolute(assignment.worktreePath)) {
    return assignment.worktreePath;
  }

  return resolve(runtime.workspaceRoot, assignment.worktreePath);
}

function assertRunMatchesAssignment(run: RunDetail, repository: Repository, assignment: WorkerDispatchAssignment) {
  if (run.id !== assignment.runId) {
    throw new Error(`run detail ${run.id} did not match assignment run ${assignment.runId}`);
  }

  if (repository.id !== assignment.repositoryId) {
    throw new Error(
      `run repository ${repository.id} did not match assignment repository ${assignment.repositoryId}`
    );
  }
}

export async function claimAndProvisionDispatchWorkspace(
  input: ClaimAndProvisionDispatchInput
): Promise<ClaimedDispatchWorkspace | null> {
  const nodeId = input.nodeId ?? input.runtime.nodeId;
  const assignment = await requestJson<WorkerDispatchAssignment | null>(
    input.controlPlane,
    "POST",
    `/api/v1/worker-nodes/${nodeId}/claim-dispatch`
  );

  if (!assignment) {
    return null;
  }

  const run = await requestJson<RunDetail>(
    input.controlPlane,
    "GET",
    `/api/v1/runs/${assignment.runId}`
  );
  const repositories = await requestJson<Repository[]>(
    input.controlPlane,
    "GET",
    "/api/v1/repositories"
  );
  const repository = repositories.find((candidate) => candidate.id === assignment.repositoryId);

  if (!repository) {
    throw new Error(`repository ${assignment.repositoryId} for assignment ${assignment.id} was not found`);
  }

  assertRunMatchesAssignment(run, repository, assignment);

  const workspace = await materializeRepositoryWorkspace({
    repository,
    destinationPath: resolveWorktreePath(input.runtime, assignment),
    branch: assignment.branchName ?? repository.defaultBranch,
    reuseExisting: resolveWorkspaceProvisioningMode() === "shared"
  });

  return {
    assignment,
    run,
    repository,
    workspace,
    bootstrap: buildRemoteWorkerBootstrap({
      runtime: input.runtime,
      dispatch: assignment
    })
  };
}
