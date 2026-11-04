-- Phase 1, task 7 (database part). Slug -> tenant, used to preview hostel sites on non-production
-- deployments (/sites/{slug} on the staging host) and to validate the site route.
-- Returns only public facts (id, slug, status) for tenants that are not archived, exactly like
-- resolve_tenant_by_host. A tenant's slug is public: it is its subdomain.

create function app.resolve_tenant_by_slug(p_slug text)
returns table (tenant_id uuid, slug text, status text)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.slug::text, t.status
  from public.tenants t
  where t.slug = lower(btrim(p_slug))
    and t.status <> 'archived'
  limit 1
$$;

create function public.resolve_tenant_by_slug(p_slug text)
returns table (tenant_id uuid, slug text, status text)
language sql
stable
set search_path = ''
as $$
  select r.tenant_id, r.slug, r.status from app.resolve_tenant_by_slug(p_slug) r
$$;

grant execute on function app.resolve_tenant_by_slug(text) to anon, authenticated, service_role;
revoke execute on function public.resolve_tenant_by_slug(text) from public;
grant execute on function public.resolve_tenant_by_slug(text) to anon, authenticated, service_role;

revoke execute on all functions in schema app from public;
