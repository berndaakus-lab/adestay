-- Security fix (found in Phase 2, task 6): hostel-admin MFA was enforced only by the app, so a
-- password-only (aal1) session could use the public Data API with the admin's full permissions.
-- Design: docs/adr/0002-authn-authz.md (TOTP required for hostel and platform admins; the database
--         is authoritative); docs/SECURITY_THREAT_MODEL.md T4; src/lib/mfa-policy.ts.
--
-- The rule mirrors the app: an account that is an active hostel admin of an active hostel, or a
-- platform admin, holds NO staff access in ANY hostel until the session is aal2.
--
-- public.my_memberships deliberately stays readable at aal1: the app uses it to learn that the
-- user is an admin and send them to MFA. It returns only the caller's own hostels and roles.
-- Residents are unaffected: app.my_resident_id does not depend on staff access.

create function app.caller_meets_mfa_policy()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
      or not (
        exists (
          select 1
          from public.tenant_memberships m
          join public.tenants t on t.id = m.tenant_id
          where m.user_id = (select auth.uid())
            and m.role = 'hostel_admin'
            and m.status = 'active'
            and t.status = 'active'
        )
        or exists (
          select 1 from public.platform_admins pa
          where pa.user_id = (select auth.uid()) and pa.revoked_at is null
        )
      )
$$;

create or replace function app.is_tenant_member(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.caller_meets_mfa_policy()
     and exists (
       select 1
       from public.tenant_memberships m
       join public.tenants t on t.id = m.tenant_id
       where m.tenant_id = p_tenant_id
         and m.user_id = (select auth.uid())
         and m.status = 'active'
         and t.status = 'active'
     )
$$;

create or replace function app.is_hostel_admin(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.caller_meets_mfa_policy()
     and exists (
       select 1
       from public.tenant_memberships m
       join public.tenants t on t.id = m.tenant_id
       where m.tenant_id = p_tenant_id
         and m.user_id = (select auth.uid())
         and m.status = 'active'
         and m.role = 'hostel_admin'
         and t.status = 'active'
     )
$$;

create or replace function app.has_permission(p_tenant_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.caller_meets_mfa_policy()
     and exists (
       select 1
       from public.tenant_memberships m
       join public.tenants t on t.id = m.tenant_id
       left join public.permission_sets ps on ps.id = m.permission_set_id
       where m.tenant_id = p_tenant_id
         and m.user_id = (select auth.uid())
         and m.status = 'active'
         and t.status = 'active'
         and (m.role = 'hostel_admin' or p_permission = any (ps.permissions))
     )
$$;

-- Internal: called only from the SECURITY DEFINER helpers above.
revoke execute on all functions in schema app from public;
