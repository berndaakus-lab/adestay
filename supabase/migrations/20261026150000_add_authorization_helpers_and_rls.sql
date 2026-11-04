-- Phase 1, task 4. Authorization helpers and row level security for every Phase 1 table.
-- Design: docs/DATABASE_DESIGN.md §3, docs/RBAC_MATRIX.md §4-5, docs/SECURITY_THREAT_MODEL.md §4 and §6,
--         docs/adr/0002-authn-authz.md (memberships in tables, not JWT claims: revocation is immediate).
--
-- Helpers are STABLE SECURITY DEFINER with search_path = '' and fully qualified names.
-- They read membership tables as the function owner, so policies never recurse into themselves.

-- -----------------------------------------------------------------------------------------
-- Helper functions
-- ------------------------------------------------------------------------------------------

-- Platform admin AND signed in with MFA (aal2). Without MFA a platform admin has no platform powers.
create function app.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
     and exists (
       select 1 from public.platform_admins pa
       where pa.user_id = (select auth.uid()) and pa.revoked_at is null
     )
$$;

create function app.tenant_is_active(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.tenants t where t.id = p_tenant_id and t.status = 'active')
$$;

-- Active staff/admin membership in an ACTIVE tenant. Suspension removes staff access at once.
create function app.is_tenant_member(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenant_memberships m
    join public.tenants t on t.id = m.tenant_id
    where m.tenant_id = p_tenant_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and t.status = 'active'
  )
$$;

create function app.is_hostel_admin(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
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

-- Hostel admins hold every tenant permission; staff hold what their permission set lists.
create function app.has_permission(p_tenant_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
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

-- The caller's resident record in a tenant. Students keep read access while a tenant is
-- suspended (decision D-16), but not once it is archived or before it is live.
create function app.my_resident_id(p_tenant_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.id
  from public.residents r
  join public.tenants t on t.id = r.tenant_id
  where r.tenant_id = p_tenant_id
    and r.user_id = (select auth.uid())
    and t.status in ('active', 'suspended')
$$;

-- Read-only, time-limited platform access to one tenant (SECURITY_THREAT_MODEL §6).
create function app.has_break_glass(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.is_platform_admin()
     and exists (
       select 1 from public.platform_access_grants g
       where g.tenant_id = p_tenant_id
         and g.platform_admin_user_id = (select auth.uid())
         and g.revoked_at is null
         and now() between g.granted_at and g.expires_at
     )
$$;

-- Display names are visible to the person, to staff managers of tenants where that person
-- is staff, and to staff who may read residents where that person is a resident.
create function app.can_view_user_profile(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id = (select auth.uid())
      or exists (
        select 1 from public.tenant_memberships m
        where m.user_id = p_user_id and app.has_permission(m.tenant_id, 'staff.manage')
      )
      or exists (
        select 1 from public.residents r
        where r.user_id = p_user_id and app.has_permission(r.tenant_id, 'residents.read')
      )
$$;

-- Host -> tenant for the request router (ADR-0005). Only verified domains of tenants that are
-- not archived; returns status so the site can show "temporarily unavailable" when suspended.
-- Normalises case, port and a trailing dot.
create function app.resolve_tenant_by_host(p_host text)
returns table (tenant_id uuid, slug text, status text)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.slug::text, t.status
  from public.tenant_domains d
  join public.tenants t on t.id = d.tenant_id
  where d.hostname = rtrim(lower(split_part(btrim(p_host), ':', 1)), '.')
    and d.status = 'verified'
    and t.status <> 'archived'
  limit 1
$$;

grant execute on function
  app.is_platform_admin(), app.is_tenant_member(uuid), app.is_hostel_admin(uuid),
  app.has_permission(uuid, text), app.my_resident_id(uuid), app.has_break_glass(uuid),
  app.can_view_user_profile(uuid)
  to authenticated, service_role;
grant execute on function app.tenant_is_active(uuid), app.resolve_tenant_by_host(text)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- tenants
-- ---------------------------------------------------------------------------
grant select, insert, update on public.tenants to authenticated;

create policy tenants_select on public.tenants for select to authenticated
  using (app.is_tenant_member(id) or app.is_platform_admin() or app.has_break_glass(id));
create policy tenants_insert_platform on public.tenants for insert to authenticated
  with check (app.is_platform_admin());
create policy tenants_update_platform on public.tenants for update to authenticated
  using (app.is_platform_admin()) with check (app.is_platform_admin());

-- ---------------------------------------------------------------------------
-- tenant_domains: platform admins manage; hostel admins can see their own
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.tenant_domains to authenticated;

create policy tenant_domains_select on public.tenant_domains for select to authenticated
  using (app.is_platform_admin() or app.is_hostel_admin(tenant_id));
create policy tenant_domains_insert_platform on public.tenant_domains for insert to authenticated
  with check (app.is_platform_admin());
create policy tenant_domains_update_platform on public.tenant_domains for update to authenticated
  using (app.is_platform_admin()) with check (app.is_platform_admin());
create policy tenant_domains_delete_platform on public.tenant_domains for delete to authenticated
  using (app.is_platform_admin());

-- ---------------------------------------------------------------------------
-- tenant_profiles: public when published and the tenant is active
-- ---------------------------------------------------------------------------
grant select on public.tenant_profiles to anon;
grant select, insert, update on public.tenant_profiles to authenticated;

create policy tenant_profiles_select_public on public.tenant_profiles for select to anon, authenticated
  using (is_published and app.tenant_is_active(tenant_id));
create policy tenant_profiles_select_member on public.tenant_profiles for select to authenticated
  using (app.is_tenant_member(tenant_id) or app.is_platform_admin());
create policy tenant_profiles_update on public.tenant_profiles for update to authenticated
  using (app.has_permission(tenant_id, 'settings.manage'))
  with check (app.has_permission(tenant_id, 'settings.manage'));
create policy tenant_profiles_insert_platform on public.tenant_profiles for insert to authenticated
  with check (app.is_platform_admin());

-- ---------------------------------------------------------------------------
-- tenant_settings: private
-- ---------------------------------------------------------------------------
grant select, insert, update on public.tenant_settings to authenticated;

create policy tenant_settings_select on public.tenant_settings for select to authenticated
  using (
    app.has_permission(tenant_id, 'settings.read')
    or app.has_permission(tenant_id, 'settings.manage')
    or app.has_break_glass(tenant_id)
  );
create policy tenant_settings_update on public.tenant_settings for update to authenticated
  using (app.has_permission(tenant_id, 'settings.manage'))
  with check (app.has_permission(tenant_id, 'settings.manage'));
create policy tenant_settings_insert_platform on public.tenant_settings for insert to authenticated
  with check (app.is_platform_admin());

-- ---------------------------------------------------------------------------
-- platform_admins: read only through the API; granted by migration/CLI only
-- ---------------------------------------------------------------------------
grant select on public.platform_admins to authenticated;

create policy platform_admins_select on public.platform_admins for select to authenticated
  using (user_id = (select auth.uid()) or app.is_platform_admin());

-- ---------------------------------------------------------------------------
-- platform_access_grants: platform admins create their own; hostel admins see grants on
-- their tenant (transparency). Only revoked_at can be changed afterwards.
-- ---------------------------------------------------------------------------
grant select, insert on public.platform_access_grants to authenticated;
grant update (revoked_at) on public.platform_access_grants to authenticated;

create policy platform_access_grants_select on public.platform_access_grants for select to authenticated
  using (
    (platform_admin_user_id = (select auth.uid()) and app.is_platform_admin())
    or app.is_hostel_admin(tenant_id)
  );
create policy platform_access_grants_insert_own on public.platform_access_grants for insert to authenticated
  with check (
    platform_admin_user_id = (select auth.uid())
    and app.is_platform_admin()
    and revoked_at is null
    and granted_at between now() - interval '1 minute' and now() + interval '1 minute'
  );
create policy platform_access_grants_revoke_own on public.platform_access_grants for update to authenticated
  using (platform_admin_user_id = (select auth.uid()) and app.is_platform_admin())
  with check (platform_admin_user_id = (select auth.uid()) and app.is_platform_admin());

-- ---------------------------------------------------------------------------
-- user_profiles
-- ---------------------------------------------------------------------------
grant select on public.user_profiles to authenticated;
grant update (display_name) on public.user_profiles to authenticated;

create policy user_profiles_select on public.user_profiles for select to authenticated
  using (app.can_view_user_profile(id));
create policy user_profiles_update_own on public.user_profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- permission_sets: system sets readable by all staff; custom sets managed by hostel admins
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.permission_sets to authenticated;

create policy permission_sets_select on public.permission_sets for select to authenticated
  using (is_system or app.is_tenant_member(tenant_id));
create policy permission_sets_insert on public.permission_sets for insert to authenticated
  with check (not is_system and app.has_permission(tenant_id, 'staff.manage'));
create policy permission_sets_update on public.permission_sets for update to authenticated
  using (not is_system and app.has_permission(tenant_id, 'staff.manage'))
  with check (not is_system and app.has_permission(tenant_id, 'staff.manage'));
create policy permission_sets_delete on public.permission_sets for delete to authenticated
  using (not is_system and app.has_permission(tenant_id, 'staff.manage'));

-- ---------------------------------------------------------------------------
-- tenant_memberships: readable; writes only through RPCs (Phase 2) that enforce
-- "no self-escalation" and "never remove the last hostel admin" (RBAC_MATRIX §5.4).
-- ---------------------------------------------------------------------------
grant select on public.tenant_memberships to authenticated;

create policy tenant_memberships_select on public.tenant_memberships for select to authenticated
  using (
    user_id = (select auth.uid())
    or app.has_permission(tenant_id, 'staff.manage')
    or app.has_break_glass(tenant_id)
  );

-- ---------------------------------------------------------------------------
-- residents: column-level privileges keep sensitive fields out of normal reads.
-- Writes go through RPCs (Phase 3 booking flow, resident profile updates).
-- ---------------------------------------------------------------------------
grant select (id, tenant_id, user_id, full_name, email, phone_e164, institution, programme, level,
              status, blocked_reason, created_at, updated_at)
  on public.residents to authenticated;

create policy residents_select on public.residents for select to authenticated
  using (
    id = app.my_resident_id(tenant_id)
    or app.has_permission(tenant_id, 'residents.read')
    or app.has_break_glass(tenant_id)
  );

-- Emergency contacts, student ID number and gender: the resident themself, or staff with
-- residents.read_sensitive (RBAC_MATRIX §2). Returns no row when not allowed.
create function public.get_resident_sensitive(p_resident_id uuid)
returns table (
  resident_id uuid,
  gender text,
  student_id_number text,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relationship text
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.gender, r.student_id_number, r.emergency_contact_name,
         r.emergency_contact_phone, r.emergency_contact_relationship
  from public.residents r
  where r.id = p_resident_id
    and (
      r.id = app.my_resident_id(r.tenant_id)
      or app.has_permission(r.tenant_id, 'residents.read_sensitive')
    )
$$;

revoke execute on function public.get_resident_sensitive(uuid) from public, anon;
grant execute on function public.get_resident_sensitive(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- audit_logs: read-only views of history
-- ---------------------------------------------------------------------------
grant select on public.audit_logs to authenticated;

create policy audit_logs_select on public.audit_logs for select to authenticated
  using (
    (tenant_id is not null and (app.has_permission(tenant_id, 'audit.read') or app.has_break_glass(tenant_id)))
    or (tenant_id is null and app.is_platform_admin())
  );

-- Postgres grants EXECUTE on new functions to PUBLIC; revoke, keeping the explicit grants above.
revoke execute on all functions in schema app from public;
