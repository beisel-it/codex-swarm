import type { RunBudgetState } from "@codex-swarm/contracts";

interface ExecuteToolResponseMetadata {
  metadata?: Record<string, unknown>;
}

export interface RunBudgetCheckpointRequest {
  <T>(method: string, path: string, payload?: Record<string, unknown>): Promise<T>;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function extractUsageDelta(metadata: Record<string, unknown> | undefined) {
  if (!metadata) {
    return {
      tokensUsedDelta: 0,
      costUsdDelta: 0
    };
  }

  const nestedUsage = metadata.usage && typeof metadata.usage === "object"
    ? metadata.usage as Record<string, unknown>
    : undefined;
  const promptTokens = readNumber(nestedUsage?.promptTokens ?? nestedUsage?.prompt_tokens);
  const completionTokens = readNumber(nestedUsage?.completionTokens ?? nestedUsage?.completion_tokens);
  const totalTokens = readNumber(
    nestedUsage?.totalTokens
    ?? nestedUsage?.total_tokens
    ?? metadata.totalTokens
    ?? metadata.tokensUsed
  );
  const costUsd = readNumber(
    nestedUsage?.costUsd
    ?? nestedUsage?.cost_usd
    ?? metadata.costUsd
    ?? metadata.cost_usd
  );

  return {
    tokensUsedDelta: totalTokens ?? Math.max(0, (promptTokens ?? 0) + (completionTokens ?? 0)),
    costUsdDelta: costUsd ?? 0
  };
}

export async function checkpointRunBudget(
  request: RunBudgetCheckpointRequest,
  runId: string,
  source: string,
  response?: ExecuteToolResponseMetadata
) {
  const usageDelta = extractUsageDelta(response?.metadata);

  return request<RunBudgetState>(
    "POST",
    `/api/v1/runs/${runId}/budget-checkpoints`,
    {
      source,
      tokensUsedDelta: usageDelta.tokensUsedDelta,
      costUsdDelta: usageDelta.costUsdDelta,
      metadata: response?.metadata ?? {}
    }
  );
}
