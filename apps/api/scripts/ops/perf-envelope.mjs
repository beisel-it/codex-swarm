const baseUrl = process.env.PERF_BASE_URL;
const authToken = process.env.PERF_AUTH_TOKEN ?? process.env.DEV_AUTH_TOKEN ?? "codex-swarm-dev-token";
const concurrency = Number.parseInt(process.env.PERF_CONCURRENCY ?? "25", 10);
const iterations = Number.parseInt(process.env.PERF_ITERATIONS ?? "100", 10);
const targetPath = process.env.PERF_TARGET_PATH ?? "/api/v1/metrics";

if (!baseUrl) {
  console.error("PERF_BASE_URL is required");
  process.exit(1);
}

function percentile(values, percentileValue) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1));
  return sorted[index] ?? 0;
}

const latencies = [];
let failures = 0;
const startedAt = Date.now();

for (let offset = 0; offset < iterations; offset += concurrency) {
  const batchSize = Math.min(concurrency, iterations - offset);

  await Promise.all(Array.from({ length: batchSize }, async () => {
    const requestStartedAt = performance.now();
    const response = await fetch(new URL(targetPath, baseUrl), {
      headers: {
        authorization: `Bearer ${authToken}`
      }
    }).catch(() => null);

    const durationMs = performance.now() - requestStartedAt;
    latencies.push(durationMs);

    if (!response || !response.ok) {
      failures += 1;
    }
  }));
}

const report = {
  target: new URL(targetPath, baseUrl).toString(),
  concurrency,
  iterations,
  failures,
  successRate: iterations === 0 ? 1 : (iterations - failures) / iterations,
  durationMs: Date.now() - startedAt,
  latencyMs: {
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    max: latencies.length === 0 ? 0 : Math.max(...latencies)
  }
};

console.log(JSON.stringify(report, null, 2));
