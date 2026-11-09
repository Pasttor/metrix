-- Per-post daily values from the networks' analytics (not cumulative), e.g. the
-- views a YouTube video got on each day since it was published.
create table public.post_metrics_daily (
  post_id uuid not null references public.posts (id) on delete cascade,
  date date not null,
  metric text not null,
  value numeric not null,
  primary key (post_id, date, metric)
);

-- Per-post breakdowns over the post's lifetime, as captured on a date
-- (traffic sources, countries, age/gender, YouTube search terms...).
create table public.post_audience_snapshots (
  post_id uuid not null references public.posts (id) on delete cascade,
  captured_on date not null,
  dimension text not null
    check (dimension in ('traffic_source', 'country', 'age_gender', 'search_term', 'city', 'device')),
  key text not null,
  value numeric not null,
  primary key (post_id, captured_on, dimension, key)
);

-- Public accounts to benchmark against (Instagram business_discovery).
create table public.competitors (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('instagram')),
  username text not null,
  name text,
  avatar_url text,
  added_at timestamptz not null default now(),
  unique (platform, username)
);

create table public.competitor_snapshots (
  competitor_id uuid not null references public.competitors (id) on delete cascade,
  date date not null,
  metric text not null,
  value numeric not null,
  primary key (competitor_id, date, metric)
);

alter table public.post_metrics_daily enable row level security;
alter table public.post_audience_snapshots enable row level security;
alter table public.competitors enable row level security;
alter table public.competitor_snapshots enable row level security;

-- Same model as the rest: only service_role writes (competitors are added
-- through a Server Action that checks the allowed user); the dashboard reads.
revoke all on public.post_metrics_daily, public.post_audience_snapshots, public.competitors, public.competitor_snapshots
  from anon, authenticated;
grant select on public.post_metrics_daily, public.post_audience_snapshots, public.competitors, public.competitor_snapshots
  to authenticated;
grant select, insert, update, delete on public.post_metrics_daily, public.post_audience_snapshots, public.competitors, public.competitor_snapshots
  to service_role;

create policy "allowed user can read" on public.post_metrics_daily
  for select to authenticated using ((select private.is_allowed_user()));
create policy "allowed user can read" on public.post_audience_snapshots
  for select to authenticated using ((select private.is_allowed_user()));
create policy "allowed user can read" on public.competitors
  for select to authenticated using ((select private.is_allowed_user()));
create policy "allowed user can read" on public.competitor_snapshots
  for select to authenticated using ((select private.is_allowed_user()));
