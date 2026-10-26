-- Phase 1, task 5. Data API entry points used by the server (proxy, getTenantContext, requirePermission).
-- Design: docs/SYSTEM_ARCHITECTURE.md §4-5, docs/adr/0005-domain-resolution.md, docs/RBAC_MATRIX.md §5.
-- Only the `public` schema is exposed by Supabase's Data API, so these thin functions expose
-- exactly what the server needs from the `app` helpers, nothing more.

-- Host -> tenant. Safe for anonymous callers: returns id, slug and status of a verified domain only.
create function public.resolve_tenant_by_host(p_host text)
returns table (tenant_id uuid, slug text, status text)
language sql
stable
set search_path = ''
as $$
  select r.tenant_id, r.slug, r.status from app.resolve_tenant_by_host(p_host) r
$$;

revoke execute on function public.resolve_tenant_by_host(text) from public;
grant execute on function public.resolve_tenant_by_host(text) to anon, authenticated, service_role;

-- The caller's active staff/admin memberships in active tenants, with effective permissions
-- (hostel admins hold the whole catalog). Read per request; revocation is immediate.
create function public.my_memberships()
returns table (tenant_id uuid, slug text, name text, role text, permissions text[])
language sql
stable
security definer
set search_path = ''
as $$
  select t.id,
         t.slug::text,
         t.name,
         m.role,
         case when m.role = 'hostel_admin' then app.permission_catalog() else coalesce(ps.permissions, '{}') end
  from public.tenant_memberships m
  join public.tenants t on t.id = m.tenant_id
  left join public.permission_sets ps on ps.id = m.permission_set_id
  where m.user_id = (select auth.uid())
    and m.status = 'active'
    and t.status = 'active'
  order by t.name
$$;

revoke execute on function public.my_memberships() from public, anon;
grant execute on function public.my_memberships() to authenticated, service_role;

-- True only for a platform admin signed in with MFA (aal2).
create function public.am_i_platform_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select app.is_platform_admin()
$$;

revoke execute on function public.am_i_platform_admin() from public, anon;
grant execute on function public.am_i_platform_admin() to authenticated, service_role;
