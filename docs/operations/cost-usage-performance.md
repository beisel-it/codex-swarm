# Cost, Usage, and Performance Envelope

## Usage and cost reporting

`GET /api/v1/metrics` now exposes:

- repository, run, task, approval, validation, artifact, and worker-node counts in `usage`
- budgeted run cost totals in `cost`

The cost surface is intentionally bounded to data already persisted on the run model:

- `runsWithBudget`
- `totalBudgetedRunCostUsd`
- `averageBudgetedRunCostUsd`
- `maxBudgetedRunCostUsd`

This is an operator/admin reporting surface, not a provider-billing reconciliation system.

## Performance baselines

The metrics report includes duration summaries for:

- completed run duration
- approval resolution duration
- validation turnaround duration

Those summaries are exposed as `p50`, `p95`, and `max` values in `performance`.

## HTTP concurrency probe

Use the lightweight probe script against a live API:

```bash
PERF_BASE_URL=http://127.0.0.1:3000 \
PERF_AUTH_TOKEN=codex-swarm-dev-token \
PERF_CONCURRENCY=25 \
PERF_ITERATIONS=100 \
corepack pnpm ops:perf
```

The script returns:

- success rate
- total probe duration
- latency `p50`
- latency `p95`
- latency `max`

## Recorded verification

The command path was smoke-tested on 2026-03-28 against a disposable local HTTP endpoint:

- concurrency: 10
- iterations: 20
- success rate: 1.0
- p50 latency: 6.37ms
- p95 latency: 31.08ms
- max latency: 72.04ms

This verifies the probe and output contract. Release-quality baselines should still be captured against a live Codex Swarm API before GA signoff.

## Interpretation

- use `usage` to understand current control-plane volume
- use `cost` to compare budgeted run posture over time
- use `performance` for persisted workflow latency baselines
- use `ops:perf` for live API concurrency checks before release or topology changes

## Limitations

- the cost report reflects budgeted run cost stored by Codex Swarm, not downstream provider invoices
- the concurrency probe is a bounded smoke baseline, not a full load-generation platform
- deeper autoscaling and fleet tuning remain outside the current support envelope
