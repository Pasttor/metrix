-- Metrix initial schema (T01).
-- Single-user app: the server writes with service_role (bypasses RLS);
-- the only authenticated user allowed to read is the one whose email
-- matches app_config.allowed_email.

-- ---------------------------------------------------------------------------
-- Config + authorization
-- ---------------------------------------------------------------------------

-- Server-only key/value settings. The allowed email is set from the
-- ALLOWED_EMAIL env var with `pnpm db:config`, so it never lives in the repo.
create table public.app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- Not exposed through the Data API.
create schema if not exists private;

create function private.is_allowed_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_config c
    where c.key = 'allowed_email'
      and lower(c.value) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function private.is_allowed_user() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_allowed_user() to authenticated;

-- ---------------------------------------------------------------------------
-- Accounts and tokens
-- ---------------------------------------------------------------------------

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('youtube', 'instagram', 'facebook', 'tiktok')),
  external_id text not null,
  name text,
  handle text,
  avatar_url text,
  -- Instagram account -> its Facebook Page.
  parent_account_id uuid references public.accounts (id) on delete set null,
  status text not null default 'active'
    check (status in ('active', 'reauth_required', 'disabled')),
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  unique (platform, external_id)
);

create index accounts_parent_account_id_idx on public.accounts (parent_account_id);

-- Encrypted with AES-256-GCM by the server (T03). Server-only.
create table public.oauth_tokens (
  account_id uuid primary key references public.accounts (id) on delete cascade,
  access_token_enc text not null,
  refresh_token_enc text,
  expires_at timestamptz,
  refresh_expires_at timestamptz,
  scopes text[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- OAuth state + PKCE verifier; expires after 10 minutes (enforced in T03). Server-only.
create table public.oauth_states (
  state text primary key,
  platform text not null check (platform in ('youtube', 'instagram', 'facebook', 'tiktok', 'meta')),
  code_verifier text,
  created_at timestamptz not null default now()
);

create index oauth_states_created_at_idx on public.oauth_states (created_at);

-- ---------------------------------------------------------------------------
-- Metrics (long format: one row per metric and date)
-- ---------------------------------------------------------------------------

create table public.account_metrics_daily (
  account_id uuid not null references public.accounts (id) on delete cascade,
  date date not null,
  metric text not null,
  value numeric not null,
  captured_at timestamptz not null default now(),
  -- Leading columns (account_id, date) also serve range queries.
  primary key (account_id, date, metric)
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  external_id text not null,
  type text not null
    check (type in ('video', 'short', 'reel', 'image', 'carousel', 'story', 'post', 'live')),
  caption text,
  permalink text,
  thumbnail_url text,
  published_at timestamptz,
  duration_seconds integer,
  raw jsonb not null default '{}',
  unique (account_id, external_id)
);

create index posts_account_id_published_at_idx on public.posts (account_id, published_at desc);

-- Cumulative value of the post on that day.
create table public.post_metric_snapshots (
  post_id uuid not null references public.posts (id) on delete cascade,
  captured_on date not null,
  metric text not null,
  value numeric not null,
  -- Leading columns (post_id, captured_on) also serve range queries.
  primary key (post_id, captured_on, metric)
);

create table public.audience_snapshots (
  account_id uuid not null references public.accounts (id) on delete cascade,
  date date not null,
  dimension text not null
    check (dimension in ('age', 'gender', 'age_gender', 'country', 'city', 'device', 'traffic_source')),
  key text not null,
  value numeric not null,
  primary key (account_id, date, dimension, key)
);

-- The same metric name can exist at account and post level (e.g. Instagram
-- `views`), so scope is part of the key.
create table public.metric_catalog (
  platform text not null check (platform in ('youtube', 'instagram', 'facebook', 'tiktok')),
  scope text not null check (scope in ('account', 'post', 'audience')),
  metric text not null,
  unified_metric text check (unified_metric in (
    'followers', 'views', 'reach', 'interactions', 'likes', 'comments',
    'shares', 'saves', 'watch_time_minutes', 'avg_view_duration_seconds'
  )),
  label_es text not null,
  description_es text,
  unit text not null default 'count'
    check (unit in ('count', 'seconds', 'milliseconds', 'minutes', 'percent', 'currency')),
  deprecated_at timestamptz,
  primary key (platform, scope, metric)
);

-- ---------------------------------------------------------------------------
-- Sync bookkeeping
-- ---------------------------------------------------------------------------

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  -- 'meta' covers a run that syncs Instagram and Facebook together.
  platform text not null check (platform in ('youtube', 'instagram', 'facebook', 'tiktok', 'meta')),
  account_id uuid references public.accounts (id) on delete set null,
  job text not null check (job in ('daily', 'backfill', 'webhook')),
  status text not null default 'running'
    check (status in ('running', 'success', 'partial', 'error')),
  cursor jsonb,
  stats jsonb not null default '{}',
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index sync_runs_platform_started_at_idx on public.sync_runs (platform, started_at desc);
create index sync_runs_account_id_idx on public.sync_runs (account_id);

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);

create index webhook_events_received_at_idx on public.webhook_events (received_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.app_config enable row level security;
alter table public.accounts enable row level security;
alter table public.oauth_tokens enable row level security;
alter table public.oauth_states enable row level security;
alter table public.account_metrics_daily enable row level security;
alter table public.posts enable row level security;
alter table public.post_metric_snapshots enable row level security;
alter table public.audience_snapshots enable row level security;
alter table public.metric_catalog enable row level security;
alter table public.sync_runs enable row level security;
alter table public.webhook_events enable row level security;

-- No user writes anywhere: only service_role writes. Users get SELECT on
-- dashboard tables only; app_config, oauth_tokens and oauth_states stay
-- server-only (no grants, no policies).
revoke all on
  public.app_config,
  public.accounts,
  public.oauth_tokens,
  public.oauth_states,
  public.account_metrics_daily,
  public.posts,
  public.post_metric_snapshots,
  public.audience_snapshots,
  public.metric_catalog,
  public.sync_runs,
  public.webhook_events
from anon, authenticated;

grant select on
  public.accounts,
  public.account_metrics_daily,
  public.posts,
  public.post_metric_snapshots,
  public.audience_snapshots,
  public.metric_catalog,
  public.sync_runs,
  public.webhook_events
to authenticated;

create policy "allowed user can read" on public.accounts
  for select to authenticated using ((select private.is_allowed_user()));
create policy "allowed user can read" on public.account_metrics_daily
  for select to authenticated using ((select private.is_allowed_user()));
create policy "allowed user can read" on public.posts
  for select to authenticated using ((select private.is_allowed_user()));
create policy "allowed user can read" on public.post_metric_snapshots
  for select to authenticated using ((select private.is_allowed_user()));
create policy "allowed user can read" on public.audience_snapshots
  for select to authenticated using ((select private.is_allowed_user()));
create policy "allowed user can read" on public.metric_catalog
  for select to authenticated using ((select private.is_allowed_user()));
create policy "allowed user can read" on public.sync_runs
  for select to authenticated using ((select private.is_allowed_user()));
create policy "allowed user can read" on public.webhook_events
  for select to authenticated using ((select private.is_allowed_user()));
