import { sql } from "drizzle-orm";

import { createDb, createPool } from "./client.js";
import {
  CONTROL_PLANE_METADATA_ID,
  CURRENT_CONTROL_PLANE_CONFIG_VERSION,
  CURRENT_CONTROL_PLANE_SCHEMA_VERSION,
  controlPlaneMetadataTableSql
} from "./versioning.js";

const statements = [
  controlPlaneMetadataTableSql,
  `create table if not exists workspaces (
    id text primary key,
    name text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create table if not exists teams (
    id text primary key,
    workspace_id text not null references workspaces(id),
    name text not null,
    policy_profile text not null default 'standard',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create table if not exists repositories (
    id text primary key,
    workspace_id text not null default 'default-workspace',
    team_id text not null default 'default-team',
    project_id text,
    name text not null,
    url text not null,
    provider text not null default 'other',
    default_branch text not null,
    local_path text,
    project_id text,
    trust_level text not null default 'trusted',
    approval_profile text not null default 'standard',
    provider_sync jsonb not null default '{"connectivityStatus":"skipped","validatedAt":null,"defaultBranch":null,"branches":[],"providerRepoUrl":null,"lastError":null}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create table if not exists projects (
    id text primary key,
    workspace_id text not null default 'default-workspace',
    team_id text not null default 'default-team',
    name text not null,
    description text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create table if not exists project_teams (
    id text primary key,
    project_id text not null references projects(id),
    workspace_id text not null default 'default-workspace',
    team_id text not null default 'default-team',
    name text not null,
    description text,
    concurrency_cap integer not null default 1,
    source_template_id text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create table if not exists project_team_members (
    id text primary key,
    project_team_id text not null references project_teams(id),
    key text not null,
    position integer not null default 0,
    name text not null,
    role text not null,
    profile text not null,
    responsibility text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create table if not exists runs (
    id text primary key,
    repository_id text not null references repositories(id),
    project_id text,
    project_team_id text,
    project_team_name text,
    workspace_id text not null default 'default-workspace',
    team_id text not null default 'default-team',
    project_id text,
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
    branch_publish_approval_id text,
    pull_request_url text,
    pull_request_number integer,
    pull_request_status text,
    pull_request_approval_id text,
    handoff_status text not null default 'pending',
    handoff_config jsonb not null default '{"mode":"manual","provider":null,"baseBranch":null,"autoPublishBranch":false,"autoCreatePullRequest":false,"titleTemplate":null,"bodyTemplate":null}'::jsonb,
    handoff_execution jsonb not null default '{"state":"idle","failureReason":null,"attemptedAt":null,"completedAt":null}'::jsonb,
    completed_at timestamptz,
    metadata jsonb not null default '{}'::jsonb,
    context jsonb not null default '{"externalInput":null,"values":{}}'::jsonb,
    created_by text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create table if not exists repeatable_run_definitions (
    id text primary key,
    repository_id text not null references repositories(id),
    project_team_id text,
    project_team_name text,
    workspace_id text not null default 'default-workspace',
    team_id text not null default 'default-team',
    name text not null,
    description text,
    status text not null,
    execution jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create table if not exists repeatable_run_triggers (
    id text primary key,
    repeatable_run_id text not null references repeatable_run_definitions(id),
    workspace_id text not null default 'default-workspace',
    team_id text not null default 'default-team',
    name text not null,
    description text,
    enabled boolean not null default true,
    kind text not null,
    config jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create table if not exists external_event_receipts (
    id text primary key,
    repeatable_run_trigger_id text not null references repeatable_run_triggers(id),
    repeatable_run_id text not null references repeatable_run_definitions(id),
    repository_id text not null references repositories(id),
    workspace_id text not null default 'default-workspace',
    team_id text not null default 'default-team',
    source_type text not null,
    status text not null,
    event jsonb not null default '{}'::jsonb,
    rejection_reason text,
    created_run_id text references runs(id),
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
    verification_status text not null default 'not_required',
    verifier_agent_id text,
    latest_verification_summary text,
    latest_verification_findings jsonb not null default '[]'::jsonb,
    latest_verification_change_requests jsonb not null default '[]'::jsonb,
    latest_verification_evidence jsonb not null default '[]'::jsonb,
    dependency_ids jsonb not null default '[]'::jsonb,
    definition_of_done jsonb not null default '[]'::jsonb,
    acceptance_criteria jsonb not null default '[]'::jsonb,
    validation_templates jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create table if not exists agents (
    id text primary key,
    run_id text not null references runs(id),
    project_team_member_id text,
    name text not null,
    role text not null,
    profile text not null default 'default',
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
    last_heartbeat_at timestamptz,
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
    workspace_id text not null default 'default-workspace',
    team_id text not null default 'default-team',
    task_id text,
    kind text not null,
    status text not null,
    requested_payload jsonb not null default '{}'::jsonb,
    resolution_payload jsonb not null default '{}'::jsonb,
    requested_by text not null,
    delegate_actor_id text,
    delegated_by text,
    delegated_at timestamptz,
    delegation_reason text,
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
    url text,
    size_bytes integer,
    sha256 text,
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
    actor jsonb default null,
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

  await db.execute(sql.raw(`
    insert into workspaces (id, name)
    values ('default-workspace', 'Default Workspace')
    on conflict (id) do nothing
  `));
  await db.execute(sql.raw(`
    insert into teams (id, workspace_id, name, policy_profile)
    values ('default-team', 'default-workspace', 'Default Team', 'standard')
    on conflict (id) do nothing
  `));

  await db.execute(sql.raw("alter table approvals add column if not exists requested_payload jsonb not null default '{}'::jsonb"));
  await db.execute(sql.raw("alter table approvals add column if not exists resolution_payload jsonb not null default '{}'::jsonb"));
  await db.execute(sql.raw("alter table repositories add column if not exists project_id text"));
  await db.execute(sql.raw("alter table runs add column if not exists project_id text"));
  await db.execute(sql.raw("alter table approvals add column if not exists workspace_id text not null default 'default-workspace'"));
  await db.execute(sql.raw("alter table approvals add column if not exists team_id text not null default 'default-team'"));
  await db.execute(sql.raw("alter table approvals add column if not exists resolver text"));
  await db.execute(sql.raw("alter table approvals add column if not exists resolved_at timestamptz"));
  await db.execute(sql.raw("alter table approvals add column if not exists delegate_actor_id text"));
  await db.execute(sql.raw("alter table approvals add column if not exists delegated_by text"));
  await db.execute(sql.raw("alter table approvals add column if not exists delegated_at timestamptz"));
  await db.execute(sql.raw("alter table approvals add column if not exists delegation_reason text"));
  await db.execute(sql.raw("alter table tasks add column if not exists verification_status text not null default 'not_required'"));
  await db.execute(sql.raw("alter table tasks add column if not exists verifier_agent_id text"));
  await db.execute(sql.raw("alter table tasks add column if not exists latest_verification_summary text"));
  await db.execute(sql.raw("alter table tasks add column if not exists latest_verification_findings jsonb not null default '[]'::jsonb"));
  await db.execute(sql.raw("alter table tasks add column if not exists latest_verification_change_requests jsonb not null default '[]'::jsonb"));
  await db.execute(sql.raw("alter table tasks add column if not exists latest_verification_evidence jsonb not null default '[]'::jsonb"));
  await db.execute(sql.raw("alter table tasks add column if not exists definition_of_done jsonb not null default '[]'::jsonb"));
  await db.execute(sql.raw("alter table tasks add column if not exists validation_templates jsonb not null default '[]'::jsonb"));
  await db.execute(sql.raw("alter table validations add column if not exists artifact_ids jsonb not null default '[]'::jsonb"));
  await db.execute(sql.raw("alter table sessions add column if not exists last_heartbeat_at timestamptz"));
  await db.execute(sql.raw("alter table worker_dispatch_assignments add column if not exists claimed_at timestamptz"));
  await db.execute(sql.raw("alter table worker_dispatch_assignments add column if not exists completed_at timestamptz"));
  await db.execute(sql.raw("alter table worker_dispatch_assignments add column if not exists last_failure_reason text"));
  await db.execute(sql.raw("alter table sessions add column if not exists worker_node_id text references worker_nodes(id)"));
  await db.execute(sql.raw("alter table sessions add column if not exists sticky_node_id text references worker_nodes(id)"));
  await db.execute(sql.raw("alter table sessions add column if not exists placement_constraint_labels jsonb not null default '[]'::jsonb"));
  await db.execute(sql.raw("alter table sessions add column if not exists state text not null default 'active'"));
  await db.execute(sql.raw("alter table sessions add column if not exists stale_reason text"));
  await db.execute(sql.raw("alter table repositories add column if not exists provider text not null default 'other'"));
  await db.execute(sql.raw("alter table repositories add column if not exists workspace_id text not null default 'default-workspace'"));
  await db.execute(sql.raw("alter table repositories add column if not exists team_id text not null default 'default-team'"));
  await db.execute(sql.raw("alter table repositories add column if not exists project_id text"));
  await db.execute(sql.raw("alter table repositories add column if not exists trust_level text not null default 'trusted'"));
  await db.execute(sql.raw("alter table repositories add column if not exists approval_profile text not null default 'standard'"));
  await db.execute(sql.raw("alter table repositories add column if not exists provider_sync jsonb not null default '{\"connectivityStatus\":\"skipped\",\"validatedAt\":null,\"defaultBranch\":null,\"branches\":[],\"providerRepoUrl\":null,\"lastError\":null}'::jsonb"));
  await db.execute(sql.raw("alter table repositories add column if not exists project_id text"));
  await db.execute(sql.raw(`create table if not exists projects (
    id text primary key,
    workspace_id text not null default 'default-workspace',
    team_id text not null default 'default-team',
    name text not null,
    description text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`));
  await db.execute(sql.raw(`create table if not exists project_teams (
    id text primary key,
    project_id text not null references projects(id),
    workspace_id text not null default 'default-workspace',
    team_id text not null default 'default-team',
    name text not null,
    description text,
    concurrency_cap integer not null default 1,
    source_template_id text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`));
  await db.execute(sql.raw(`create table if not exists project_team_members (
    id text primary key,
    project_team_id text not null references project_teams(id),
    key text not null,
    position integer not null default 0,
    name text not null,
    role text not null,
    profile text not null,
    responsibility text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`));
  await db.execute(sql.raw("alter table teams add column if not exists policy_profile text not null default 'standard'"));
  await db.execute(sql.raw("alter table runs add column if not exists budget_tokens integer"));
  await db.execute(sql.raw("alter table runs add column if not exists budget_cost_usd_cents integer"));
  await db.execute(sql.raw("alter table runs add column if not exists workspace_id text not null default 'default-workspace'"));
  await db.execute(sql.raw("alter table runs add column if not exists team_id text not null default 'default-team'"));
  await db.execute(sql.raw("alter table runs add column if not exists project_id text"));
  await db.execute(sql.raw("alter table runs add column if not exists project_team_id text"));
  await db.execute(sql.raw("alter table runs add column if not exists project_team_name text"));
  await db.execute(sql.raw("alter table runs add column if not exists concurrency_cap integer not null default 1"));
  await db.execute(sql.raw("alter table runs add column if not exists policy_profile text"));
  await db.execute(sql.raw("alter table runs add column if not exists published_branch text"));
  await db.execute(sql.raw("alter table runs add column if not exists branch_published_at timestamptz"));
  await db.execute(sql.raw("alter table runs add column if not exists branch_publish_approval_id text references approvals(id)"));
  await db.execute(sql.raw("alter table runs add column if not exists pull_request_url text"));
  await db.execute(sql.raw("alter table runs add column if not exists pull_request_number integer"));
  await db.execute(sql.raw("alter table runs add column if not exists pull_request_status text"));
  await db.execute(sql.raw("alter table runs add column if not exists pull_request_approval_id text references approvals(id)"));
  await db.execute(sql.raw("alter table runs add column if not exists handoff_status text not null default 'pending'"));
  await db.execute(sql.raw("alter table runs add column if not exists handoff_config jsonb not null default '{\"mode\":\"manual\",\"provider\":null,\"baseBranch\":null,\"autoPublishBranch\":false,\"autoCreatePullRequest\":false,\"titleTemplate\":null,\"bodyTemplate\":null}'::jsonb"));
  await db.execute(sql.raw("alter table runs add column if not exists handoff_execution jsonb not null default '{\"state\":\"idle\",\"failureReason\":null,\"attemptedAt\":null,\"completedAt\":null}'::jsonb"));
  await db.execute(sql.raw("alter table runs add column if not exists completed_at timestamptz"));
  await db.execute(sql.raw("alter table runs add column if not exists context jsonb not null default '{\"externalInput\":null,\"values\":{}}'::jsonb"));
  await db.execute(sql.raw(`create table if not exists repeatable_run_definitions (
    id text primary key,
    repository_id text not null references repositories(id),
    project_team_id text,
    project_team_name text,
    workspace_id text not null default 'default-workspace',
    team_id text not null default 'default-team',
    name text not null,
    description text,
    status text not null,
    execution jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`));
  await db.execute(sql.raw("alter table repeatable_run_definitions add column if not exists project_team_id text"));
  await db.execute(sql.raw("alter table repeatable_run_definitions add column if not exists project_team_name text"));
  await db.execute(sql.raw("alter table agents add column if not exists project_team_member_id text"));
  await db.execute(sql.raw("alter table agents add column if not exists profile text not null default 'default'"));
  await db.execute(sql.raw(`create table if not exists repeatable_run_triggers (
    id text primary key,
    repeatable_run_id text not null references repeatable_run_definitions(id),
    workspace_id text not null default 'default-workspace',
    team_id text not null default 'default-team',
    name text not null,
    description text,
    enabled boolean not null default true,
    kind text not null,
    config jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`));
  await db.execute(sql.raw(`create table if not exists external_event_receipts (
    id text primary key,
    repeatable_run_trigger_id text not null references repeatable_run_triggers(id),
    repeatable_run_id text not null references repeatable_run_definitions(id),
    repository_id text not null references repositories(id),
    workspace_id text not null default 'default-workspace',
    team_id text not null default 'default-team',
    source_type text not null,
    status text not null,
    event jsonb not null default '{}'::jsonb,
    rejection_reason text,
    created_run_id text references runs(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`));
  await db.execute(sql.raw("alter table artifacts add column if not exists url text"));
  await db.execute(sql.raw("alter table artifacts add column if not exists size_bytes integer"));
  await db.execute(sql.raw("alter table artifacts add column if not exists sha256 text"));
  await db.execute(sql.raw("alter table control_plane_events add column if not exists actor jsonb default null"));
  await db.execute(sql.raw(controlPlaneMetadataTableSql));
  await db.execute(sql.raw("alter table control_plane_metadata add column if not exists config_version text not null default '1'"));
  await db.execute(sql.raw("alter table control_plane_metadata add column if not exists upgraded_at timestamptz not null default now()"));
  await db.execute(sql.raw("alter table control_plane_metadata add column if not exists notes text"));
  await db.execute(sql.raw(`
    insert into control_plane_metadata (id, schema_version, config_version, upgraded_at, notes)
    values (
      '${CONTROL_PLANE_METADATA_ID}',
      '${CURRENT_CONTROL_PLANE_SCHEMA_VERSION}',
      '${CURRENT_CONTROL_PLANE_CONFIG_VERSION}',
      now(),
      'M6 upgrade-safe schema/config metadata'
    )
    on conflict (id) do update
      set schema_version = excluded.schema_version,
          config_version = excluded.config_version,
          upgraded_at = excluded.upgraded_at,
          notes = excluded.notes
  `));

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
