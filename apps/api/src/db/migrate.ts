import { sql } from "drizzle-orm";

import { createDb, createPool } from "./client.js";

const statements = [
  `create table if not exists repositories (
    id text primary key,
    name text not null,
    url text not null,
    provider text not null default 'other',
    default_branch text not null,
    local_path text,
    trust_level text not null default 'trusted',
    approval_profile text not null default 'standard',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create table if not exists runs (
    id text primary key,
    repository_id text not null references repositories(id),
    goal text not null,
    status text not null,
    branch_name text,
    plan_artifact_path text,
    budget_tokens integer,
    budget_cost_usd_cents integer,
    concurrency_cap integer not null default 1,
    policy_profile text,
    published_branch text,
    branch_published_at timestamptz,
    pull_request_url text,
    pull_request_number integer,
    pull_request_status text,
    handoff_status text not null default 'pending',
    completed_at timestamptz,
    metadata jsonb not null default '{}'::jsonb,
    created_by text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create table if not exists tasks (
    id text primary key,
    run_id text not null references runs(id),
    parent_task_id text,
    title text not null,
    description text not null,
    role text not null,
    status text not null,
    priority integer not null default 3,
    owner_agent_id text,
    dependency_ids jsonb not null default '[]'::jsonb,
    acceptance_criteria jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create table if not exists agents (
    id text primary key,
    run_id text not null references runs(id),
    name text not null,
    role text not null,
    status text not null,
    worktree_path text,
    branch_name text,
    current_task_id text,
    last_heartbeat_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create table if not exists worker_nodes (
    id text primary key,
    name text not null,
    endpoint text,
    capability_labels jsonb not null default '[]'::jsonb,
    status text not null default 'online',
    drain_state text not null default 'active',
    last_heartbeat_at timestamptz,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create table if not exists sessions (
    id text primary key,
    agent_id text not null references agents(id),
    thread_id text not null,
    cwd text not null,
    sandbox text not null,
    approval_policy text not null,
    include_plan_tool boolean not null default false,
    worker_node_id text references worker_nodes(id),
    sticky_node_id text references worker_nodes(id),
    placement_constraint_labels jsonb not null default '[]'::jsonb,
    state text not null default 'active',
    stale_reason text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create table if not exists worker_dispatch_assignments (
    id text primary key,
    run_id text not null references runs(id),
    task_id text not null references tasks(id),
    agent_id text not null references agents(id),
    session_id text references sessions(id),
    repository_id text not null references repositories(id),
    repository_name text not null,
    queue text not null default 'worker-dispatch',
    state text not null default 'queued',
    sticky_node_id text references worker_nodes(id),
    preferred_node_id text references worker_nodes(id),
    claimed_by_node_id text references worker_nodes(id),
    required_capabilities jsonb not null default '[]'::jsonb,
    worktree_path text not null,
    branch_name text,
    prompt text not null,
    profile text not null,
    sandbox text not null,
    approval_policy text not null,
    include_plan_tool boolean not null default false,
    metadata jsonb not null default '{}'::jsonb,
    attempt integer not null default 0,
    max_attempts integer not null default 3,
    lease_ttl_seconds integer not null default 300,
    claimed_at timestamptz,
    completed_at timestamptz,
    last_failure_reason text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create table if not exists messages (
    id text primary key,
    run_id text not null references runs(id),
    sender_agent_id text,
    recipient_agent_id text,
    kind text not null,
    body text not null,
    created_at timestamptz not null default now()
  )`,
  `create table if not exists approvals (
    id text primary key,
    run_id text not null references runs(id),
    task_id text,
    kind text not null,
    status text not null,
    requested_payload jsonb not null default '{}'::jsonb,
    resolution_payload jsonb not null default '{}'::jsonb,
    requested_by text not null,
    resolver text,
    resolved_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create table if not exists validations (
    id text primary key,
    run_id text not null references runs(id),
    task_id text,
    name text not null,
    status text not null,
    command text not null,
    summary text,
    artifact_path text,
    artifact_ids jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create table if not exists artifacts (
    id text primary key,
    run_id text not null references runs(id),
    task_id text,
    kind text not null,
    path text not null,
    content_type text not null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  )`,
  `create table if not exists control_plane_events (
    id text primary key,
    run_id text references runs(id),
    task_id text,
    agent_id text,
    trace_id text not null,
    event_type text not null,
    entity_type text not null,
    entity_id text not null,
    status text not null,
    summary text not null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  )`
];

async function main() {
  const pool = createPool();
  const db = createDb(pool);

  for (const statement of statements) {
    await db.execute(sql.raw(statement));
  }

  await db.execute(sql.raw("alter table approvals add column if not exists requested_payload jsonb not null default '{}'::jsonb"));
  await db.execute(sql.raw("alter table approvals add column if not exists resolution_payload jsonb not null default '{}'::jsonb"));
  await db.execute(sql.raw("alter table approvals add column if not exists resolver text"));
  await db.execute(sql.raw("alter table approvals add column if not exists resolved_at timestamptz"));
  await db.execute(sql.raw("alter table validations add column if not exists artifact_ids jsonb not null default '[]'::jsonb"));
  await db.execute(sql.raw("alter table worker_dispatch_assignments add column if not exists claimed_at timestamptz"));
  await db.execute(sql.raw("alter table worker_dispatch_assignments add column if not exists completed_at timestamptz"));
  await db.execute(sql.raw("alter table worker_dispatch_assignments add column if not exists last_failure_reason text"));
  await db.execute(sql.raw("alter table sessions add column if not exists worker_node_id text references worker_nodes(id)"));
  await db.execute(sql.raw("alter table sessions add column if not exists sticky_node_id text references worker_nodes(id)"));
  await db.execute(sql.raw("alter table sessions add column if not exists placement_constraint_labels jsonb not null default '[]'::jsonb"));
  await db.execute(sql.raw("alter table sessions add column if not exists state text not null default 'active'"));
  await db.execute(sql.raw("alter table sessions add column if not exists stale_reason text"));
  await db.execute(sql.raw("alter table repositories add column if not exists provider text not null default 'other'"));
  await db.execute(sql.raw("alter table repositories add column if not exists trust_level text not null default 'trusted'"));
  await db.execute(sql.raw("alter table repositories add column if not exists approval_profile text not null default 'standard'"));
  await db.execute(sql.raw("alter table runs add column if not exists budget_tokens integer"));
  await db.execute(sql.raw("alter table runs add column if not exists budget_cost_usd_cents integer"));
  await db.execute(sql.raw("alter table runs add column if not exists concurrency_cap integer not null default 1"));
  await db.execute(sql.raw("alter table runs add column if not exists policy_profile text"));
  await db.execute(sql.raw("alter table runs add column if not exists published_branch text"));
  await db.execute(sql.raw("alter table runs add column if not exists branch_published_at timestamptz"));
  await db.execute(sql.raw("alter table runs add column if not exists pull_request_url text"));
  await db.execute(sql.raw("alter table runs add column if not exists pull_request_number integer"));
  await db.execute(sql.raw("alter table runs add column if not exists pull_request_status text"));
  await db.execute(sql.raw("alter table runs add column if not exists handoff_status text not null default 'pending'"));
  await db.execute(sql.raw("alter table runs add column if not exists completed_at timestamptz"));

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
