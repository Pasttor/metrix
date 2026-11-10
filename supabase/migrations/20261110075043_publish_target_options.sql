-- Per-network choices made for each post: TikTok privacy level, interaction
-- settings and commercial content disclosure; YouTube visibility and the
-- made-for-kids declaration. Kept apart from `state` so a retry (which resets
-- `state`) keeps what the user chose.
alter table public.scheduled_post_targets
  add column options jsonb not null default '{}';

-- Recreate so the returned row type includes the new column.
create or replace function public.claim_publish_targets(p_limit integer, p_lease_seconds integer)
returns setof public.scheduled_post_targets
language sql
security invoker
set search_path = ''
as $$
  update public.scheduled_post_targets t
     set locked_until = now() + make_interval(secs => p_lease_seconds),
         updated_at = now()
   where t.id in (
     select t2.id
       from public.scheduled_post_targets t2
       join public.scheduled_posts p on p.id = t2.scheduled_post_id
      where t2.status in ('pending', 'processing')
        and p.status <> 'canceled'
        and p.scheduled_at <= now()
        and (t2.next_check_at is null or t2.next_check_at <= now())
        and (t2.locked_until is null or t2.locked_until < now())
      order by p.scheduled_at, t2.scheduled_post_id, t2.id
      limit p_limit
      for update of t2 skip locked
   )
  returning t.*;
$$;

revoke all on function public.claim_publish_targets(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_publish_targets(integer, integer) to service_role;
