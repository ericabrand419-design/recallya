create extension if not exists pgcrypto;

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  email text,
  age_verified boolean default false,
  lifetime_value numeric default 0,
  notes text,
  created_at timestamptz default now()
);

create table if not exists identities (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete cascade,
  platform text not null,
  platform_user_id text not null,
  handle text,
  unique(platform, platform_user_id)
);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  platform text not null,
  platform_thread_id text,
  status text default 'bot',
  requires_review boolean default false,
  last_message_at timestamptz default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  direction text not null,
  body text not null,
  automated boolean default false,
  created_at timestamptz default now()
);

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  destination_url text,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  platform text not null,
  body text not null,
  media_url text,
  scheduled_for timestamptz not null,
  status text default 'queued',
  external_post_id text,
  last_error text,
  created_at timestamptz default now()
);

create table if not exists approval_queue (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  request_type text not null,
  request_summary text not null,
  proposed_response text,
  status text default 'pending',
  created_at timestamptz default now()
);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  detail jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Recallya Core CRM extensions
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website text,
  created_at timestamptz default now()
);

alter table customers add column if not exists organization_id uuid references organizations(id) on delete set null;
alter table customers add column if not exists role_title text;
alter table customers add column if not exists relationship_summary text;
alter table customers add column if not exists preferences jsonb default '[]'::jsonb;
alter table customers add column if not exists objections jsonb default '[]'::jsonb;
alter table customers add column if not exists memory jsonb default '[]'::jsonb;

create table if not exists opportunities (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete cascade,
  name text not null,
  stage text not null,
  value numeric default 0,
  next_best_action text,
  next_best_action_reason text,
  status text default 'open',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists commitments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  commitment_text text not null,
  owner text default 'human',
  due_at timestamptz,
  status text default 'open',
  extracted_automatically boolean default false,
  created_at timestamptz default now()
);

create table if not exists crm_tasks (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  title text not null,
  due_at timestamptz,
  status text default 'open',
  source text default 'manual',
  created_at timestamptz default now()
);

create table if not exists calendar_events (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  external_calendar_id text,
  created_at timestamptz default now()
);

create table if not exists email_sequences (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  goal text,
  sending_mode text default 'approval',
  stop_conditions jsonb default '[]'::jsonb,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists sequence_enrollments (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid references email_sequences(id) on delete cascade,
  customer_id uuid references customers(id) on delete cascade,
  status text default 'active',
  current_step integer default 0,
  next_send_at timestamptz,
  created_at timestamptz default now(),
  unique(sequence_id, customer_id)
);

-- Lead intake
alter table customers add column if not exists lead_source text default 'Existing CRM';
alter table customers add column if not exists lead_status text default 'active';
alter table customers add column if not exists captured_at timestamptz default now();

create table if not exists lead_intake_events (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  source text not null,
  source_detail text,
  raw_payload jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists customers_lead_source_idx on customers(lead_source);
create index if not exists customers_lead_status_idx on customers(lead_status);

-- Recallya v2: Voice Studio, Publisher, channel policy and Rouge configuration
create table if not exists voice_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  slug text not null,
  name text not null,
  use_case text,
  directness integer default 70 check (directness between 0 and 100),
  warmth integer default 70 check (warmth between 0 and 100),
  formality integer default 50 check (formality between 0 and 100),
  sales_energy integer default 70 check (sales_energy between 0 and 100),
  description text,
  sample_messages jsonb default '[]'::jsonb,
  avoid_phrases jsonb default '[]'::jsonb,
  cta_style text,
  is_rouge boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(organization_id, slug)
);

create table if not exists channel_configs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  channel text not null,
  connection_status text default 'disconnected',
  publishing_mode text default 'approval',
  default_voice_profile_id uuid references voice_profiles(id) on delete set null,
  policy_config jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(organization_id, channel)
);

alter table campaigns add column if not exists goal text;
alter table campaigns add column if not exists core_message text;
alter table campaigns add column if not exists voice_profile_id uuid references voice_profiles(id) on delete set null;
alter table campaigns add column if not exists publishing_mode text default 'approval';
alter table campaigns add column if not exists schedule_label text;
alter table campaigns add column if not exists status text default 'draft';
alter table campaigns add column if not exists results jsonb default '{}'::jsonb;

alter table scheduled_posts add column if not exists voice_profile_id uuid references voice_profiles(id) on delete set null;
alter table scheduled_posts add column if not exists approval_required boolean default false;
alter table scheduled_posts add column if not exists policy_snapshot jsonb default '{}'::jsonb;

create table if not exists automation_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  rule_key text not null,
  name text not null,
  enabled boolean default true,
  mode text default 'approval',
  config jsonb default '{}'::jsonb,
  updated_at timestamptz default now(),
  unique(organization_id, rule_key)
);

create table if not exists rouge_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade unique,
  enabled boolean default false,
  voice_profile_id uuid references voice_profiles(id) on delete set null,
  provider_name text,
  provider_endpoint_label text,
  boundaries text,
  conversation_mode text default 'approval',
  custom_request_mode text default 'human_approval',
  updated_at timestamptz default now()
);

create table if not exists campaign_attribution_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  channel text,
  event_type text not null,
  value numeric default 0,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists voice_profiles_org_idx on voice_profiles(organization_id);
create index if not exists channel_configs_org_idx on channel_configs(organization_id);
create index if not exists campaign_attribution_campaign_idx on campaign_attribution_events(campaign_id);

-- Recallya 2.1: tenant workspaces / multi-business portfolio
create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  workspace_type text default 'business',
  category text,
  website text,
  primary_goal text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid,
  role text default 'owner',
  can_view_portfolio boolean default false,
  created_at timestamptz default now(),
  unique(workspace_id, user_id)
);

create table if not exists workspace_products (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  price_label text,
  active boolean default true,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table customers add column if not exists workspace_id uuid references workspaces(id) on delete cascade;
alter table identities add column if not exists workspace_id uuid references workspaces(id) on delete cascade;
alter table conversations add column if not exists workspace_id uuid references workspaces(id) on delete cascade;
alter table campaigns add column if not exists workspace_id uuid references workspaces(id) on delete cascade;
alter table scheduled_posts add column if not exists workspace_id uuid references workspaces(id) on delete cascade;
alter table approval_queue add column if not exists workspace_id uuid references workspaces(id) on delete cascade;
alter table audit_log add column if not exists workspace_id uuid references workspaces(id) on delete cascade;
alter table opportunities add column if not exists workspace_id uuid references workspaces(id) on delete cascade;
alter table commitments add column if not exists workspace_id uuid references workspaces(id) on delete cascade;
alter table crm_tasks add column if not exists workspace_id uuid references workspaces(id) on delete cascade;
alter table calendar_events add column if not exists workspace_id uuid references workspaces(id) on delete cascade;
alter table email_sequences add column if not exists workspace_id uuid references workspaces(id) on delete cascade;
alter table sequence_enrollments add column if not exists workspace_id uuid references workspaces(id) on delete cascade;
alter table lead_intake_events add column if not exists workspace_id uuid references workspaces(id) on delete cascade;
alter table voice_profiles add column if not exists workspace_id uuid references workspaces(id) on delete cascade;
alter table channel_configs add column if not exists workspace_id uuid references workspaces(id) on delete cascade;
alter table automation_rules add column if not exists workspace_id uuid references workspaces(id) on delete cascade;
alter table rouge_settings add column if not exists workspace_id uuid references workspaces(id) on delete cascade;
alter table campaign_attribution_events add column if not exists workspace_id uuid references workspaces(id) on delete cascade;

create index if not exists customers_workspace_idx on customers(workspace_id);
create index if not exists conversations_workspace_idx on conversations(workspace_id);
create index if not exists campaigns_workspace_idx on campaigns(workspace_id);
create index if not exists tasks_workspace_idx on crm_tasks(workspace_id);
create index if not exists events_workspace_idx on calendar_events(workspace_id);
create index if not exists sequences_workspace_idx on email_sequences(workspace_id);
create index if not exists workspace_products_workspace_idx on workspace_products(workspace_id);

-- Portfolio queries should aggregate only workspaces the signed-in user can access.
-- In production, add Supabase/Auth RLS policies keyed to workspace_members.user_id.


-- Recallya 2.2: trust, team operations and explainability
create table if not exists team_members (
  id text primary key,
  workspace_id text not null,
  name text not null,
  role text,
  access_scope text not null default 'workspace',
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists relationship_memory (
  id text primary key,
  workspace_id text not null,
  customer_id text not null,
  memory_text text not null,
  source_type text not null,
  source_ref text,
  confidence text not null default 'recorded',
  human_verified boolean not null default false,
  superseded_by text,
  created_at timestamptz not null default now()
);

create table if not exists communication_consent (
  customer_id text primary key,
  workspace_id text not null,
  email_allowed boolean not null default false,
  sms_allowed boolean not null default false,
  dm_allowed boolean not null default false,
  do_not_contact boolean not null default false,
  preferred_channel text,
  frequency_preference text,
  updated_at timestamptz not null default now()
);

create table if not exists relationship_assignments (
  id text primary key,
  workspace_id text not null,
  customer_id text not null,
  owner_member_id text not null,
  assigned_by text,
  reason text,
  assigned_at timestamptz not null default now()
);

create table if not exists workflow_rules (
  id text primary key,
  workspace_id text not null,
  name text not null,
  trigger_description text not null,
  actions_json jsonb not null default '[]'::jsonb,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists relationship_documents (
  id text primary key,
  workspace_id text not null,
  customer_id text not null,
  name text not null,
  kind text,
  storage_ref text,
  status text,
  created_at timestamptz not null default now()
);

create table if not exists quotes_proposals (
  id text primary key,
  workspace_id text not null,
  customer_id text not null,
  name text not null,
  amount numeric,
  status text not null default 'draft',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists service_cases (
  id text primary key,
  workspace_id text not null,
  customer_id text not null,
  title text not null,
  status text not null,
  priority text,
  resolution text,
  updated_at timestamptz not null default now()
);

create table if not exists smart_notifications (
  id text primary key,
  workspace_id text not null,
  customer_id text,
  priority text not null,
  type text not null,
  title text not null,
  detail text,
  action text,
  dismissed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists identity_resolution_suggestions (
  id text primary key,
  workspace_id text not null,
  candidate_customer_ids jsonb not null default '[]'::jsonb,
  reason text,
  confidence numeric,
  status text not null default 'review',
  created_at timestamptz not null default now()
);

-- Recallya 2.3 relationship reconstruction
alter table if exists customers add column if not exists active_in_recallya boolean default true;
alter table if exists customers add column if not exists lifecycle_stage text;
alter table if exists customers add column if not exists relationship_stage text;
alter table if exists customers add column if not exists stage_source text;
alter table if exists customers add column if not exists stage_confidence numeric;
alter table if exists customers add column if not exists stage_human_locked boolean default false;
alter table if exists customers add column if not exists relationship_reason text;
alter table if exists customers add column if not exists needs_relationship_review boolean default false;
alter table if exists customers add column if not exists import_batch_id uuid;

create table if not exists import_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  workspace_id text,
  filename text not null,
  source_format text,
  total_rows integer default 0,
  imported_rows integer default 0,
  duplicate_rows integer default 0,
  status text default 'pending',
  mapping jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  completed_at timestamptz
);

create table if not exists relationship_inferences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  customer_id uuid,
  proposed_stage text,
  lifecycle text,
  confidence numeric,
  reason text,
  evidence jsonb default '[]'::jsonb,
  engine text,
  status text default 'suggested',
  human_override boolean default false,
  created_at timestamptz default now(),
  reviewed_at timestamptz
);

create table if not exists relationship_context_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  customer_id uuid,
  source_type text not null,
  source_ref text,
  raw_text text,
  extracted_context jsonb default '{}'::jsonb,
  explicit_fact boolean default true,
  created_by text,
  created_at timestamptz default now()
);

create table if not exists connected_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  workspace_id text,
  provider text not null,
  account_identifier text,
  scopes text[],
  status text default 'pending',
  token_secret_ref text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists communication_learning_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  voice_profile_id uuid,
  source_type text,
  source_ref text,
  observed_text text,
  user_correction text,
  accepted boolean,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_relationship_inferences_customer on relationship_inferences(customer_id);
create index if not exists idx_context_entries_customer on relationship_context_entries(customer_id);
create index if not exists idx_import_jobs_workspace on import_jobs(workspace_id);


-- Recallya 3.0 production account persistence
create table if not exists workspace_app_state (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  revision bigint not null default 1,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table if not exists workspace_billing (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  plan_key text not null default 'free',
  active_contact_limit integer not null default 50,
  workspace_limit integer not null default 1,
  seat_limit integer not null default 1,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists workspace_members_user_idx on workspace_members(user_id);
create index if not exists workspace_app_state_updated_idx on workspace_app_state(updated_at desc);

alter table workspace_app_state enable row level security;
alter table workspace_billing enable row level security;

-- Server APIs use the Supabase service role after verifying the signed-in user and
-- workspace_members authorization. Direct browser access to these tables remains blocked.


-- Lock down every public table: the browser never talks to Supabase directly.
-- Server APIs use the service role (which bypasses RLS) after checking the signed-in user.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;
