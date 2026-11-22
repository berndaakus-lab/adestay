-- Phase 2, task 10. Lets the domain verification job record what Vercel reports.
-- Design: docs/SYSTEM_ARCHITECTURE.md §6 (domain verification polling), docs/adr/0005-domain-resolution.md,
--         docs/DEPLOYMENT_AND_OPERATIONS.md §3, docs/SECURITY_THREAT_MODEL.md T18.
--
-- The job has no user session, so public.set_domain_status (platform admin + aal2) cannot serve it.
-- This function is granted to the service role only and can do much less: it moves a CUSTOM domain
-- that is still pending or failed. It never touches a verified, primary or removed domain, so a
-- temporary DNS or API problem cannot take a live hostel site offline.

create function public.record_domain_check(p_domain_id uuid, p_status text, p_verification jsonb default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_domain public.tenant_domains;
begin
  if p_status is null or p_status not in ('pending', 'verified', 'failed') then
    raise exception 'status must be pending, verified or failed' using errcode = '22023';
  end if;
  if p_verification is not null and (jsonb_typeof(p_verification) <> 'object' or octet_length(p_verification::text) > 8192) then
    raise exception 'verification details must be a small JSON object' using errcode = '22023';
  end if;

  select d.* into v_domain
  from public.tenant_domains d
  join public.tenants t on t.id = d.tenant_id
  where d.id = p_domain_id
    and d.kind = 'custom'
    and d.status in ('pending', 'failed')
    and not d.is_primary
    and t.status <> 'archived'
  for update of d;
  if not found then
    return false;
  end if;

  update public.tenant_domains d
  set status = p_status,
      verified_at = case when p_status = 'verified' then now() end,
      last_checked_at = now(),
      verification = coalesce(p_verification, d.verification)
  where d.id = p_domain_id;

  if p_status = 'verified' then
    perform app.write_audit(
      v_domain.tenant_id, 'tenant_domain.verified', 'tenant_domains', p_domain_id::text,
      jsonb_build_object('hostname', v_domain.hostname, 'status', v_domain.status),
      jsonb_build_object('status', 'verified'), null, 'cron'
    );
  end if;
  return true;
end;
$$;

revoke execute on function public.record_domain_check(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_domain_check(uuid, text, jsonb) to service_role;
