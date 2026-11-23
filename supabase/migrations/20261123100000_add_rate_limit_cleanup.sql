-- Phase 3, task 13. Remove finished rate-limit buckets, called by the hold-expiry job.
-- Design: docs/SECURITY_THREAT_MODEL.md §5, §7 (data minimisation); docs/SYSTEM_ARCHITECTURE.md §6.
--
-- Bucket keys hold a user id or a keyed IP hash, so they should not be kept longer than needed.
-- The longest rate-limit window is one hour; a day leaves a wide safety margin.

create function public.purge_expired_rate_limits()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_removed integer;
begin
  delete from private.rate_limits rl where rl.window_start < now() - interval '1 day';
  get diagnostics v_removed = row_count;
  return v_removed;
end;
$$;

revoke execute on function public.purge_expired_rate_limits() from public, anon, authenticated;
grant execute on function public.purge_expired_rate_limits() to service_role;

revoke execute on all functions in schema app from public;
