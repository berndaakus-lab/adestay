-- Phase 3, task 15. Which optional details the booking form must ask for.
-- Design: docs/SECURITY_THREAT_MODEL.md §7 (collect only what the booking needs); D-14.
--
-- tenant_settings is private. A visitor needs just these two facts to see the right form, and
-- submit_booking_request still enforces them.

create function public.booking_form_rules(p_tenant_id uuid)
returns table (student_id_required boolean, gender_required boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select s.student_id_required, s.gender_policy_enforced
  from public.tenant_settings s
  join public.tenants t on t.id = s.tenant_id and t.status = 'active'
  join public.tenant_profiles p on p.tenant_id = t.id and p.is_published
  where s.tenant_id = p_tenant_id
$$;

revoke execute on function public.booking_form_rules(uuid) from public;
grant execute on function public.booking_form_rules(uuid) to anon, authenticated, service_role;

revoke execute on all functions in schema app from public;
