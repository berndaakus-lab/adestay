-- Phase 2, task 8. Lets a platform admin see and re-send a hostel's first-admin invitation.
-- Design: docs/RBAC_MATRIX.md §4 (platform admin creates the first hostel admin; no general read of
--         staff memberships without break-glass); task 4 notes in docs/IMPLEMENTATION_CHECKLIST.md.
--
-- Deliberately narrow: hostel-admin rows only, open or accepted, with email and status. Ordinary
-- staff are never returned.

create function public.platform_hostel_admin_invitations(p_tenant_id uuid)
returns table (membership_id uuid, email text, status text, accepted_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin();
  return query
    select m.id, m.invited_email::text, m.status, m.accepted_at
    from public.tenant_memberships m
    where m.tenant_id = p_tenant_id
      and m.role = 'hostel_admin'
      and m.status in ('invited', 'active')
    order by m.created_at;
end;
$$;

revoke execute on function public.platform_hostel_admin_invitations(uuid) from public, anon;
grant execute on function public.platform_hostel_admin_invitations(uuid) to authenticated, service_role;
