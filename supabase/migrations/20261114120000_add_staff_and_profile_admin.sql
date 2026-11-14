-- Phase 2, task 3. Hostel administration in the database: staff invitations and membership changes
-- (RPC only), custom permission sets, and safer profile/settings edits (brand colour contrast,
-- server-generated branding paths, column-level update grants).
-- Design: docs/RBAC_MATRIX.md §2, §4, §5.4; docs/DATABASE_DESIGN.md §4.1; docs/SECURITY_THREAT_MODEL.md
--         T2, T5, T8, T11; docs/UI_UX_DESIGN_SYSTEM.md §2 (brand colours ≥ 4.5:1); Phase 2 criteria 3 and 6.
--
-- Error codes used by the RPCs (mapped to messages by the server):
--   42501 not allowed (also for "no such membership", so ids cannot be probed)
--   22023 invalid input          23505 already a member / already invited
--   23514 rule violation (e.g. last hostel admin, from the Phase 1 trigger)

-- ---------------------------------------------------------------------------------------------
-- Brand colours: readable as button background under white text and as text on the ivory page.
-- Used in a CHECK constraint, so API roles need EXECUTE (pure function, no data access).
-- WCAG 2.x relative luminance, same formula as tests/unit/contrast.test.ts.
-- ---------------------------------------------------------------------------------------------
create function app.brand_color_is_readable(p_hex text)
returns boolean
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v_rgb double precision[];
  v_lum double precision := 0;
  v_white constant double precision := 1.0;
  -- Relative luminance of --ivory #f7f5ef.
  v_ivory double precision;
  v_c double precision;
  v_weights constant double precision[] := array[0.2126, 0.7152, 0.0722];
  i integer;
begin
  if p_hex is null then
    return true;
  end if;
  if p_hex !~ '^#[0-9a-f]{6}$' then
    return false;
  end if;

  for i in 1..3 loop
    v_c := ('x' || substr(p_hex, 2 * i, 2))::bit(8)::integer / 255.0;
    v_c := case when v_c <= 0.03928 then v_c / 12.92 else ((v_c + 0.055) / 1.055) ^ 2.4 end;
    v_lum := v_lum + v_weights[i] * v_c;
  end loop;

  v_ivory := 0.2126 * (((247 / 255.0) + 0.055) / 1.055) ^ 2.4
           + 0.7152 * (((245 / 255.0) + 0.055) / 1.055) ^ 2.4
           + 0.0722 * (((239 / 255.0) + 0.055) / 1.055) ^ 2.4;

  -- Brand colours are dark: white text on them, and they are darker than ivory.
  return (v_white + 0.05) / (v_lum + 0.05) >= 4.5
     and (v_ivory + 0.05) / (v_lum + 0.05) >= 4.5;
end;
$$;

grant execute on function app.brand_color_is_readable(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- tenant_profiles: colour contrast, branding paths in the tenant's folder, text limits,
-- and no way to change tenant_id through the API.
-- ---------------------------------------------------------------------------------------------
alter table public.tenant_profiles
  add constraint tenant_profiles_primary_color_readable check (app.brand_color_is_readable(primary_color)),
  add constraint tenant_profiles_accent_color_readable check (app.brand_color_is_readable(accent_color)),
  add constraint tenant_profiles_logo_path_format check (
    logo_path is null or (
      logo_path ~ '^[0-9a-f-]{36}/branding/[a-z0-9-]{8,64}\.(jpg|png|webp)$'
      and starts_with(logo_path, tenant_id::text || '/branding/')
    )
  ),
  add constraint tenant_profiles_hero_image_path_format check (
    hero_image_path is null or (
      hero_image_path ~ '^[0-9a-f-]{36}/branding/[a-z0-9-]{8,64}\.(jpg|png|webp)$'
      and starts_with(hero_image_path, tenant_id::text || '/branding/')
    )
  ),
  add constraint tenant_profiles_text_lengths check (
    (tagline is null or char_length(tagline) <= 160)
    and (about is null or char_length(about) <= 4000)
    and (address is null or char_length(address) <= 300)
    and (landmark_directions is null or char_length(landmark_directions) <= 500)
    and (map_url is null or char_length(map_url) <= 2000)
    and (policies_md is null or char_length(policies_md) <= 20000)
    and (terms_md is null or char_length(terms_md) <= 20000)
  );

revoke update on public.tenant_profiles from authenticated;
grant update (display_name, tagline, about, logo_path, hero_image_path, primary_color, accent_color,
              contact_phone, contact_email, whatsapp_phone, address, digital_address, landmark_directions,
              map_url, policies_md, terms_md, is_published)
  on public.tenant_profiles to authenticated;

revoke update on public.tenant_settings from authenticated;
grant update (hold_duration_hours, hold_extension_max, require_payment_before_allocation, deposit_policy,
              deposit_value, min_paid_percent_for_checkin, late_fee_policy, booking_requires_verified_email,
              student_id_required, gender_policy_enforced, timezone)
  on public.tenant_settings to authenticated;

-- ---------------------------------------------------------------------------------------------
-- permission_sets: custom sets stay direct edits under the Phase 1 policies (staff.manage, never
-- system sets, catalog check). Tighten the columns: a set cannot move tenant or become a system set.
-- ---------------------------------------------------------------------------------------------
alter table public.permission_sets
  add constraint permission_sets_description_length check (description is null or char_length(description) <= 300);

revoke insert, update on public.permission_sets from authenticated;
grant insert (tenant_id, key, name, description, permissions) on public.permission_sets to authenticated;
grant update (name, description, permissions) on public.permission_sets to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Membership RPCs. tenant_memberships has no write grants for API roles (Phase 1); these
-- SECURITY DEFINER functions are the only API path. Each re-checks staff.manage on the row's
-- own tenant, refuses changes to the caller's own membership, and refuses granting what the
-- caller does not hold. The Phase 1 trigger still protects the last active hostel admin.
-- ---------------------------------------------------------------------------------------------

-- Validates a role / permission-set pair for p_tenant_id against what the caller may grant.
create function app.check_grantable_role(p_tenant_id uuid, p_role text, p_permission_set_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_perms text[];
begin
  if p_role = 'hostel_admin' then
    if p_permission_set_id is not null then
      raise exception 'hostel admins do not have a permission set' using errcode = '22023';
    end if;
    if not app.is_hostel_admin(p_tenant_id) then
      raise exception 'only a hostel admin can make someone a hostel admin' using errcode = '42501';
    end if;
    return;
  end if;

  if p_role is distinct from 'staff' then
    raise exception 'role must be hostel_admin or staff' using errcode = '22023';
  end if;
  if p_permission_set_id is null then
    raise exception 'staff need a permission set' using errcode = '22023';
  end if;

  select ps.permissions into v_perms
  from public.permission_sets ps
  where ps.id = p_permission_set_id and (ps.tenant_id is null or ps.tenant_id = p_tenant_id);
  if not found then
    raise exception 'permission set not found' using errcode = '22023';
  end if;

  if not app.is_hostel_admin(p_tenant_id)
     and exists (select 1 from unnest(v_perms) p where not app.has_permission(p_tenant_id, p)) then
    raise exception 'you cannot grant permissions you do not hold' using errcode = '42501';
  end if;
end;
$$;

-- Loads a membership for a change by the caller, locked; 42501 if missing or not manageable.
create function app.lock_manageable_membership(p_membership_id uuid)
returns public.tenant_memberships
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.tenant_memberships;
begin
  select m.* into v_row from public.tenant_memberships m where m.id = p_membership_id for update;
  if not found or not app.has_permission(v_row.tenant_id, 'staff.manage') then
    raise exception 'membership not found' using errcode = '42501';
  end if;
  if v_row.user_id is not null and v_row.user_id = (select auth.uid()) then
    raise exception 'you cannot change your own membership' using errcode = '42501';
  end if;
  if v_row.role = 'hostel_admin' and not app.is_hostel_admin(v_row.tenant_id) then
    raise exception 'only a hostel admin can change a hostel admin' using errcode = '42501';
  end if;
  return v_row;
end;
$$;

-- Invite someone by email. Creates (or reopens a revoked) membership in status 'invited'.
-- The server then sends the Supabase invitation email from the provisioning module (task 8).
create function public.invite_staff_member(
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
declare
  v_uid uuid := (select auth.uid());
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_existing public.tenant_memberships;
  v_id uuid;
begin
  if v_uid is null or not app.has_permission(p_tenant_id, 'staff.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid email address' using errcode = '22023';
  end if;
  perform app.check_grantable_role(p_tenant_id, p_role, p_permission_set_id);

  -- Serialise invitations for this tenant so two admins cannot invite the same address twice.
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
        invited_email = v_email, invited_by = v_uid, revoked_at = null, accepted_at = null
    where m.id = v_existing.id
    returning m.id into v_id;
  else
    insert into public.tenant_memberships (tenant_id, user_id, role, permission_set_id, status, invited_email, invited_by)
    values (p_tenant_id, null, p_role, p_permission_set_id, 'invited', v_email, v_uid)
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

-- Called after sign-in: accepts every open invitation addressed to the caller's confirmed email.
create function public.accept_my_invitations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_count integer;
begin
  if v_uid is null then
    return 0;
  end if;
  select lower(u.email) into v_email
  from auth.users u
  where u.id = v_uid and u.email_confirmed_at is not null;
  if v_email is null then
    return 0;
  end if;

  update public.tenant_memberships m
  set user_id = v_uid, status = 'active', accepted_at = now()
  from public.tenants t
  where t.id = m.tenant_id
    and t.status <> 'archived'
    and m.status = 'invited'
    and m.invited_email = v_email::extensions.citext
    and (m.user_id is null or m.user_id = v_uid)
    and not exists (
      select 1 from public.tenant_memberships o
      where o.tenant_id = m.tenant_id and o.user_id = v_uid and o.id <> m.id
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Change another member's role or permission set.
create function public.change_member_role(p_membership_id uuid, p_role text, p_permission_set_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.tenant_memberships := app.lock_manageable_membership(p_membership_id);
begin
  if v_row.status = 'revoked' then
    raise exception 'a revoked membership cannot be changed; invite the person again' using errcode = '22023';
  end if;
  perform app.check_grantable_role(v_row.tenant_id, p_role, p_permission_set_id);

  update public.tenant_memberships m
  set role = p_role, permission_set_id = p_permission_set_id
  where m.id = v_row.id;
end;
$$;

-- Revoke a membership or cancel an open invitation, with a reason in the audit log.
create function public.revoke_membership(p_membership_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.tenant_memberships := app.lock_manageable_membership(p_membership_id);
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if v_row.status = 'revoked' then
    raise exception 'membership is already revoked' using errcode = '22023';
  end if;
  if char_length(v_reason) not between 3 and 500 then
    raise exception 'a reason (3-500 characters) is required' using errcode = '22023';
  end if;

  update public.tenant_memberships m
  set status = 'revoked', revoked_at = now()
  where m.id = v_row.id;

  perform app.write_audit(
    v_row.tenant_id,
    case when v_row.status = 'invited' then 'membership.invitation_cancelled' else 'membership.revoked' end,
    'tenant_memberships',
    v_row.id::text,
    jsonb_build_object('status', v_row.status, 'role', v_row.role),
    jsonb_build_object('status', 'revoked'),
    v_reason
  );
end;
$$;

revoke execute on function
  public.invite_staff_member(uuid, text, text, uuid), public.accept_my_invitations(),
  public.change_member_role(uuid, text, uuid), public.revoke_membership(uuid, text)
  from public, anon;
grant execute on function
  public.invite_staff_member(uuid, text, text, uuid), public.accept_my_invitations(),
  public.change_member_role(uuid, text, uuid), public.revoke_membership(uuid, text)
  to authenticated, service_role;

-- Postgres grants EXECUTE on new functions to PUBLIC; keep only the explicit grants above.
revoke execute on all functions in schema app from public;
