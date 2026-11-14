-- Phase 2, task 4. Platform administration: create a tenant, invite its first hostel admin,
-- activate / suspend / restore, and manage its domains.
-- Design: docs/RBAC_MATRIX.md §4 (tenants, domains, first hostel admin); docs/DATABASE_DESIGN.md §1
--         ("transitions are enforced in RPC functions, not by ad-hoc updates") and §4.1;
--         docs/adr/0005-domain-resolution.md; docs/SECURITY_THREAT_MODEL.md T17, T18, T19;
--         Phase 2 acceptance criteria 1, 5, 6.
--
-- Every RPC requires app.is_platform_admin() (platform_admins row AND aal2). Phase 1 let platform
-- admins write tenants / tenant_domains / first profile and settings rows directly; those direct
-- grants and policies are removed here so status changes always go through a checked, audited path.
--
-- Error codes: 42501 not allowed, 22023 invalid input or transition, 23505 duplicate,
-- 23514 database rule (e.g. reserved slug).

-- ---------------------------------------------------------------------------------------------
-- Remove direct platform writes (reads are unchanged)
-- ---------------------------------------------------------------------------------------------
drop policy tenants_insert_platform on public.tenants;
drop policy tenants_update_platform on public.tenants;
drop policy tenant_domains_insert_platform on public.tenant_domains;
drop policy tenant_domains_update_platform on public.tenant_domains;
drop policy tenant_domains_delete_platform on public.tenant_domains;
drop policy tenant_profiles_insert_platform on public.tenant_profiles;
drop policy tenant_settings_insert_platform on public.tenant_settings;

revoke insert, update, delete on public.tenants from authenticated;
revoke insert, update, delete on public.tenant_domains from authenticated;
revoke insert on public.tenant_profiles from authenticated;
revoke insert on public.tenant_settings from authenticated;

-- ---------------------------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------------------------
create function app.require_platform_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'platform admin with MFA required' using errcode = '42501';
  end if;
end;
$$;

-- Lower-case, trimmed hostname without a trailing dot, or null when empty.
create function app.normalise_hostname(p_host text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(rtrim(lower(btrim(coalesce(p_host, ''))), '.'), '')
$$;

-- Creates or reopens an invitation. Callers have already checked who may invite and the role.
-- One implementation for hostel admins (invite_staff_member) and platform admins.
create function app.open_invitation(p_tenant_id uuid, p_email text, p_role text, p_permission_set_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_existing public.tenant_memberships;
  v_id uuid;
begin
  if char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid email address' using errcode = '22023';
  end if;

  -- Serialise invitations for this tenant so the same address cannot be invited twice.
  perform 1 from public.tenants t where t.id = p_tenant_id for update;

  select m.* into v_existing
  from public.tenant_memberships m
  left join auth.users u on u.id = m.user_id
  where m.tenant_id = p_tenant_id
    and (m.invited_email = v_email::extensions.citext or lower(u.email) = v_email)
  order by (m.status <> 'revoked') desc, m.updated_at desc
  limit 1;

  if found and v_existing.status in ('invited', 'active') then
    raise exception 'this person is already a member or has an open invitation' using errcode = '23505';
  end if;

  if found then
    update public.tenant_memberships m
    set role = p_role, permission_set_id = p_permission_set_id, status = 'invited',
        invited_email = v_email, invited_by = (select auth.uid()), revoked_at = null, accepted_at = null
    where m.id = v_existing.id
    returning m.id into v_id;
  else
    insert into public.tenant_memberships (tenant_id, user_id, role, permission_set_id, status, invited_email, invited_by)
    values (p_tenant_id, null, p_role, p_permission_set_id, 'invited', v_email, (select auth.uid()))
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- Same behaviour as task 3 (tests 011), now through the shared helper.
create or replace function public.invite_staff_member(
  p_tenant_id uuid,
  p_email text,
  p_role text,
  p_permission_set_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not app.has_permission(p_tenant_id, 'staff.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if char_length(lower(btrim(coalesce(p_email, '')))) > 254
     or lower(btrim(coalesce(p_email, ''))) !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid email address' using errcode = '22023';
  end if;
  perform app.check_grantable_role(p_tenant_id, p_role, p_permission_set_id);
  return app.open_invitation(p_tenant_id, p_email, p_role, p_permission_set_id);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- First hostel admin. A platform admin may invite a hostel admin only while the hostel has no
-- active hostel admin (onboarding, or recovery after the admin left); afterwards the hostel's
-- own admins manage staff (RBAC_MATRIX §4: "C first hostel admin at onboarding").
-- ---------------------------------------------------------------------------------------------
create function public.platform_invite_hostel_admin(p_tenant_id uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin();
  if not exists (select 1 from public.tenants t where t.id = p_tenant_id and t.status <> 'archived') then
    raise exception 'hostel not found' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.tenant_memberships m
    where m.tenant_id = p_tenant_id and m.role = 'hostel_admin' and m.status = 'active'
  ) then
    raise exception 'this hostel already has an active admin, who invites further staff' using errcode = '23505';
  end if;
  return app.open_invitation(p_tenant_id, p_email, 'hostel_admin', null);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Create a tenant: tenant (onboarding), unpublished profile, default settings, the platform
-- subdomain (when the root domain is known, D-1) and optionally the first admin invitation.
-- The subdomain is served by the wildcard domain on Vercel, so it is verified at once (ADR-0005).
-- ---------------------------------------------------------------------------------------------
create function public.create_tenant(
  p_slug text,
  p_name text,
  p_reference_prefix text,
  p_platform_root_domain text default null,
  p_admin_email text default null,
  p_legal_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_root text := app.normalise_hostname(p_platform_root_domain);
begin
  perform app.require_platform_admin();

  insert into public.tenants (slug, name, legal_name, reference_prefix, status, created_by)
  values (v_slug, v_name, nullif(btrim(coalesce(p_legal_name, '')), ''), upper(btrim(coalesce(p_reference_prefix, ''))),
          'onboarding', (select auth.uid()))
  returning id into v_id;

  insert into public.tenant_profiles (tenant_id, display_name) values (v_id, v_name);
  insert into public.tenant_settings (tenant_id) values (v_id);

  if v_root is not null then
    insert into public.tenant_domains (tenant_id, hostname, kind, status, is_primary, verified_at, last_checked_at)
    values (v_id, v_slug || '.' || v_root, 'platform_subdomain', 'verified', true, now(), now());
  end if;

  if nullif(btrim(coalesce(p_admin_email, '')), '') is not null then
    perform public.platform_invite_hostel_admin(v_id, p_admin_email);
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Status transitions: onboarding → active, active → suspended, suspended → active.
-- Archiving (offboarding) is a separate, approved procedure and not exposed here.
-- ---------------------------------------------------------------------------------------------
create function public.set_tenant_status(p_tenant_id uuid, p_status text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant public.tenants;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_action text;
begin
  perform app.require_platform_admin();

  select t.* into v_tenant from public.tenants t where t.id = p_tenant_id for update;
  if not found then
    raise exception 'hostel not found' using errcode = '22023';
  end if;
  if char_length(v_reason) not between 3 and 500 then
    raise exception 'a reason (3-500 characters) is required' using errcode = '22023';
  end if;

  if v_tenant.status = 'onboarding' and p_status = 'active' then
    if not exists (
      select 1 from public.tenant_memberships m
      where m.tenant_id = p_tenant_id and m.role = 'hostel_admin' and m.status in ('invited', 'active')
    ) then
      raise exception 'invite a hostel admin before activating the hostel' using errcode = '22023';
    end if;
    update public.tenants set status = 'active' where id = p_tenant_id;
    v_action := 'tenant.activated';
  elsif v_tenant.status = 'active' and p_status = 'suspended' then
    update public.tenants set status = 'suspended', suspended_at = now(), suspension_reason = v_reason
    where id = p_tenant_id;
    v_action := 'tenant.suspended';
  elsif v_tenant.status = 'suspended' and p_status = 'active' then
    update public.tenants set status = 'active', suspended_at = null, suspension_reason = null
    where id = p_tenant_id;
    v_action := 'tenant.restored';
  else
    raise exception 'a hostel cannot go from % to %', v_tenant.status, p_status using errcode = '22023';
  end if;

  perform app.write_audit(
    p_tenant_id, v_action, 'tenants', p_tenant_id::text,
    jsonb_build_object('status', v_tenant.status), jsonb_build_object('status', p_status),
    v_reason, 'platform_admin'
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Domains. A domain that is primary must stay verified; make another domain primary first.
-- ---------------------------------------------------------------------------------------------
create function public.add_custom_domain(p_tenant_id uuid, p_hostname text, p_platform_root_domain text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host text := app.normalise_hostname(p_hostname);
  v_root text := app.normalise_hostname(p_platform_root_domain);
  v_id uuid;
begin
  perform app.require_platform_admin();
  if not exists (select 1 from public.tenants t where t.id = p_tenant_id and t.status <> 'archived') then
    raise exception 'hostel not found' using errcode = '22023';
  end if;
  if v_host is null or v_host !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' then
    raise exception 'invalid hostname' using errcode = '22023';
  end if;
  -- Names under the platform domain are platform subdomains, never custom domains (T18).
  if v_root is not null and (v_host = v_root or v_host like '%.' || v_root) then
    raise exception 'a custom domain cannot be under the platform domain' using errcode = '22023';
  end if;

  insert into public.tenant_domains (tenant_id, hostname, kind, status, is_primary)
  values (p_tenant_id, v_host, 'custom', 'pending', false)
  returning id into v_id;
  return v_id;
exception
  when unique_violation then
    raise exception 'this hostname is already in use' using errcode = '23505';
end;
$$;

-- Manual verification status (until the Vercel Domains API is configured, task 10).
create function public.set_domain_status(p_domain_id uuid, p_status text, p_verification jsonb default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_domain public.tenant_domains;
begin
  perform app.require_platform_admin();
  select d.* into v_domain from public.tenant_domains d where d.id = p_domain_id for update;
  if not found or v_domain.status = 'removed' then
    raise exception 'domain not found' using errcode = '22023';
  end if;
  if p_status is null or p_status not in ('pending', 'verified', 'failed') then
    raise exception 'status must be pending, verified or failed' using errcode = '22023';
  end if;
  if v_domain.is_primary and p_status <> 'verified' then
    raise exception 'make another verified domain primary first' using errcode = '22023';
  end if;
  if p_verification is not null and (jsonb_typeof(p_verification) <> 'object' or octet_length(p_verification::text) > 8192) then
    raise exception 'verification details must be a small JSON object' using errcode = '22023';
  end if;

  update public.tenant_domains d
  set status = p_status,
      verified_at = case when p_status = 'verified' then coalesce(d.verified_at, now()) end,
      last_checked_at = now(),
      verification = coalesce(p_verification, d.verification)
  where d.id = p_domain_id;
end;
$$;

create function public.set_primary_domain(p_domain_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_domain public.tenant_domains;
begin
  perform app.require_platform_admin();
  select d.* into v_domain from public.tenant_domains d where d.id = p_domain_id;
  if not found or v_domain.status = 'removed' then
    raise exception 'domain not found' using errcode = '22023';
  end if;
  if v_domain.status <> 'verified' then
    raise exception 'only a verified domain can be primary' using errcode = '22023';
  end if;

  perform 1 from public.tenants t where t.id = v_domain.tenant_id for update;
  update public.tenant_domains set is_primary = false
  where tenant_id = v_domain.tenant_id and is_primary and id <> p_domain_id;
  update public.tenant_domains set is_primary = true where id = p_domain_id;
end;
$$;

create function public.remove_domain(p_domain_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_domain public.tenant_domains;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  perform app.require_platform_admin();
  select d.* into v_domain from public.tenant_domains d where d.id = p_domain_id for update;
  if not found or v_domain.status = 'removed' then
    raise exception 'domain not found' using errcode = '22023';
  end if;
  if v_domain.is_primary then
    raise exception 'make another verified domain primary first' using errcode = '22023';
  end if;
  if char_length(v_reason) not between 3 and 500 then
    raise exception 'a reason (3-500 characters) is required' using errcode = '22023';
  end if;

  update public.tenant_domains set status = 'removed', is_primary = false, last_checked_at = now()
  where id = p_domain_id;

  perform app.write_audit(
    v_domain.tenant_id, 'tenant_domain.removed', 'tenant_domains', p_domain_id::text,
    jsonb_build_object('hostname', v_domain.hostname, 'status', v_domain.status),
    jsonb_build_object('status', 'removed'), v_reason, 'platform_admin'
  );
end;
$$;

revoke execute on function
  public.platform_invite_hostel_admin(uuid, text),
  public.create_tenant(text, text, text, text, text, text),
  public.set_tenant_status(uuid, text, text),
  public.add_custom_domain(uuid, text, text),
  public.set_domain_status(uuid, text, jsonb),
  public.set_primary_domain(uuid),
  public.remove_domain(uuid, text)
  from public, anon;
grant execute on function
  public.platform_invite_hostel_admin(uuid, text),
  public.create_tenant(text, text, text, text, text, text),
  public.set_tenant_status(uuid, text, text),
  public.add_custom_domain(uuid, text, text),
  public.set_domain_status(uuid, text, jsonb),
  public.set_primary_domain(uuid),
  public.remove_domain(uuid, text)
  to authenticated, service_role;

-- Postgres grants EXECUTE on new functions to PUBLIC; keep app.* internal.
revoke execute on all functions in schema app from public;
