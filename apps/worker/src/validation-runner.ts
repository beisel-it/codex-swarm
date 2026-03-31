import { once } from "node:events";
import {
  spawn,
  type ChildProcess,
  type SpawnOptions,
} from "node:child_process";

import type {
  Artifact,
  RunDetail,
  Task,
  Validation,
} from "@codex-swarm/contracts";

export interface WorkerControlPlaneRequest {
  <T>(
    method: string,
    path: string,
    payload?: Record<string, unknown>,
  ): Promise<T>;
}

export interface ValidationCommandExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ValidationExecutionReport {
  runId: string;
  taskId: string;
  templateName: string;
  status: "passed" | "failed";
  command: string;
  cwd: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  exitCode: number;
  stdout: string;
  stderr: string;
}

type ValidationTemplate = Task["validationTemplates"][number];

export interface ExecuteTaskValidationTemplateInput {
  request: WorkerControlPlaneRequest;
  runId: string;
  taskId: string;
  templateName: string;
  cwd: string;
  runDetail?: RunDetail;
  env?: NodeJS.ProcessEnv;
  shell?: string;
  spawnImpl?: (
    command: string,
    args: readonly string[],
    options: SpawnOptions,
  ) => ChildProcess;
  now?: () => Date;
}

export interface ExecutedTaskValidationTemplate {
  task: Task;
  template: ValidationTemplate;
  artifact: Artifact;
  validation: Validation;
  report: ValidationExecutionReport;
}

function getDefaultShell() {
  if (process.platform === "win32") {
    return process.env.ComSpec ?? "cmd.exe";
  }

  return process.env.SHELL ?? "/bin/bash";
}

function getShellArgs(shell: string, command: string) {
  if (process.platform === "win32" && shell.toLowerCase().includes("cmd")) {
    return ["/d", "/s", "/c", command];
  }

  return ["-lc", command];
}

function getFallbackArtifactPath(taskId: string, templateName: string) {
  return `.swarm/validations/${taskId}/${templateName}.json`;
}

function createValidationSummary(
  template: ValidationTemplate,
  status: "passed" | "failed",
  exitCode: number,
) {
  if (template.summary) {
    return template.summary;
  }

  return `${template.name} ${status} (exit ${exitCode})`;
}

function resolveTask(runDetail: RunDetail, taskId: string) {
  const task = runDetail.tasks.find((candidate) => candidate.id === taskId);

  if (!task) {
    throw new Error(`task ${taskId} was not found in run ${runDetail.id}`);
  }

  return task;
}

function resolveValidationTemplate(task: Task, templateName: string) {
  const template = task.validationTemplates.find(
    (candidate) => candidate.name === templateName,
  );

  if (!template) {
    throw new Error(
      `validation template ${templateName} was not found on task ${task.id}`,
    );
  }

  return template;
}

export async function executeValidationCommand(
  command: string,
  options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    shell?: string;
    spawnImpl?: (
      command: string,
      args: readonly string[],
      options: SpawnOptions,
    ) => ChildProcess;
  },
): Promise<ValidationCommandExecutionResult> {
  const shell = options.shell ?? getDefaultShell();
  const args = getShellArgs(shell, command);
  const spawnImpl = options.spawnImpl ?? spawn;
  const child = spawnImpl(shell, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";

  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string | Buffer) => {
    stdout += String(chunk);
  });
  child.stderr?.on("data", (chunk: string | Buffer) => {
    stderr += String(chunk);
  });

  const [code] = (await once(child, "exit")) as [
    number | null,
    NodeJS.Signals | null,
  ];

  return {
    exitCode: code ?? 1,
    stdout,
    stderr,
  };
}

export async function executeTaskValidationTemplate(
  input: ExecuteTaskValidationTemplateInput,
): Promise<ExecutedTaskValidationTemplate> {
  const runDetail =
    input.runDetail ??
    (await input.request<RunDetail>("GET", `/api/v1/runs/${input.runId}`));
  const task = resolveTask(runDetail, input.taskId);
  const template = resolveValidationTemplate(task, input.templateName);
  const now = input.now ?? (() => new Date());
  const startedAt = now();
  const commandResult = await executeValidationCommand(template.command, {
    cwd: input.cwd,
    ...(input.env ? { env: input.env } : {}),
    ...(input.shell ? { shell: input.shell } : {}),
    ...(input.spawnImpl ? { spawnImpl: input.spawnImpl } : {}),
  });
  const completedAt = now();
  const status = commandResult.exitCode === 0 ? "passed" : "failed";
  const artifactPath =
    template.artifactPath ?? getFallbackArtifactPath(task.id, template.name);
  const report: ValidationExecutionReport = {
    runId: input.runId,
    taskId: task.id,
    templateName: template.name,
    status,
    command: template.command,
    cwd: input.cwd,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(),
    exitCode: commandResult.exitCode,
    stdout: commandResult.stdout,
    stderr: commandResult.stderr,
  };

  const artifact = await input.request<Artifact>("POST", "/api/v1/artifacts", {
    runId: input.runId,
    taskId: task.id,
    kind: "report",
    path: artifactPath,
    contentType: "application/json",
    contentBase64: Buffer.from(
      JSON.stringify(report, null, 2),
      "utf8",
    ).toString("base64"),
    metadata: {
      validationTemplate: template.name,
      validationStatus: status,
      exitCode: commandResult.exitCode,
    },
  });

  const validation = await input.request<Validation>(
    "POST",
    "/api/v1/validations",
    {
      runId: input.runId,
      taskId: task.id,
      templateName: template.name,
      status,
      summary: createValidationSummary(
        template,
        status,
        commandResult.exitCode,
      ),
      artifactPath,
      artifactIds: [artifact.id],
    },
  );

  return {
    task,
    template,
    artifact,
    validation,
    report,
  };
}
