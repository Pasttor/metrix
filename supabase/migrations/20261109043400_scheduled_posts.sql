-- Posts the user schedules: one video from Google Drive, published to one or
-- more networks at a given time by the publish cron.
create table public.scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  caption text not null default '',
  drive_file_id text not null,
  drive_file_name text,
  drive_mime_type text,
  drive_size_bytes bigint,
  thumbnail_url text,
  scheduled_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'publishing', 'done', 'partial', 'failed', 'canceled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index scheduled_posts_scheduled_at_idx on public.scheduled_posts (scheduled_at desc);

-- One row per destination network. `state` keeps the in-flight upload
-- (container ids, upload sessions, publish ids) so a slow network can finish
-- on a later cron run; `locked_until` is a lease so two runs never process
-- the same target.
create table public.scheduled_post_targets (
  id uuid primary key default gen_random_uuid(),
  scheduled_post_id uuid not null references public.scheduled_posts (id) on delete cascade,
  platform text not null check (platform in ('youtube', 'instagram', 'facebook', 'tiktok')),
  account_id uuid references public.accounts (id) on delete set null,
  caption text,
  title text,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'published', 'failed', 'canceled')),
  attempts integer not null default 0,
  state jsonb not null default '{}',
  next_check_at timestamptz,
  locked_until timestamptz,
  external_id text,
  permalink text,
  error text,
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (scheduled_post_id, platform)
);

create index scheduled_post_targets_status_idx on public.scheduled_post_targets (status, next_check_at);

alter table public.scheduled_posts enable row level security;
alter table public.scheduled_post_targets enable row level security;

-- Same model as the rest: the dashboard reads; Server Actions and the cron
-- write through service_role after checking the allowed user / cron secret.
revoke all on public.scheduled_posts, public.scheduled_post_targets from anon, authenticated;
grant select on public.scheduled_posts, public.scheduled_post_targets to authenticated;
grant select, insert, update, delete on public.scheduled_posts, public.scheduled_post_targets to service_role;

create policy "allowed user can read" on public.scheduled_posts
  for select to authenticated using ((select private.is_allowed_user()));
create policy "allowed user can read" on public.scheduled_post_targets
  for select to authenticated using ((select private.is_allowed_user()));
