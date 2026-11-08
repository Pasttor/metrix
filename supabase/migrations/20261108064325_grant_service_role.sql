-- Supabase no longer grants DML on new public tables automatically, so the
-- server (service_role) needs explicit privileges to read and write.
grant select, insert, update, delete on
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
to service_role;
