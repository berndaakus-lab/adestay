-- Phase 1, task 3. People and access: user profiles, permission sets, staff memberships, residents.
-- Design: docs/DATABASE_DESIGN.md §4.1-4.2, docs/RBAC_MATRIX.md §1-3, docs/adr/0002-authn-authz.md.
-- RLS enabled and forced with no policies (deny by default). Policies and API grants: task 4.

-- Minimal global profile. Deliberately holds no tenant-specific personal data.
create table public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_profiles_display_name_length check (display_name is null or char_length(display_name) <= 120)
);

comment on table public.user_profiles is 'Global profile per auth user. Tenant-specific personal data lives in residents.';

-- Create the profile when Supabase Auth creates a user.
create function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (id, display_name)
  values (new.id, left(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), 120))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- Permission sets: system templates (tenant_id null) and tenant-specific custom sets.
create table public.permission_sets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id) on delete cascade,
  key text not null,
  name text not null,
  description text,
  permissions text[] not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint permission_sets_tenant_key_key unique nulls not distinct (tenant_id, key),
  constraint permission_sets_key_format check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  constraint permission_sets_name_length check (char_length(name) between 2 and 80),
  -- Only catalog permissions, no duplicates, and never payments.configure or staff.manage.
  constraint permission_sets_permissions_valid check (app.valid_permissions(permissions)),
  constraint permission_sets_system_has_no_tenant check (is_system = (tenant_id is null))
);

comment on table public.permission_sets is 'Named groups of permissions assigned to hostel staff (docs/RBAC_MATRIX.md §3).';

-- System permission sets (reference data, docs/RBAC_MATRIX.md §3).
insert into public.permission_sets (tenant_id, key, name, description, permissions, is_system) values
  (null, 'front_desk', 'Front Desk', 'Arrivals, check-in and walk-in bookings.',
    array['bookings.read', 'bookings.create_on_behalf', 'allocations.read', 'inventory.read',
          'residents.read', 'residents.read_sensitive', 'checkin.manage', 'maintenance.read'], true),
  (null, 'accounts', 'Accounts', 'Invoices, payments and refunds requests.',
    array['bookings.read', 'residents.read', 'finance.read', 'finance.invoice_manage',
          'finance.record_payment', 'finance.refund_request', 'reports.read'], true),
  (null, 'maintenance', 'Maintenance', 'Maintenance requests and bed availability.',
    array['allocations.read', 'inventory.read', 'maintenance.read', 'maintenance.manage'], true),
  (null, 'manager', 'Manager', 'Day-to-day running of the hostel, without staff or payment-gateway control.',
    array['bookings.read', 'bookings.review', 'bookings.cancel', 'bookings.create_on_behalf',
          'allocations.read', 'allocations.manage', 'inventory.read', 'inventory.manage',
          'residents.read', 'residents.read_sensitive', 'residents.manage', 'checkin.manage',
          'finance.read', 'finance.invoice_manage', 'finance.record_payment',
          'finance.refund_request', 'finance.refund_approve',
          'maintenance.read', 'maintenance.manage', 'announcements.manage',
          'reports.read', 'reports.export', 'settings.read', 'audit.read'], true);

-- Staff and hostel admins. Students are not members; they are residents.
create table public.tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  -- Null while an invitation is outstanding for someone without an account yet.
  user_id uuid references auth.users (id) on delete cascade,
  role text not null,
  permission_set_id uuid references public.permission_sets (id) on delete restrict,
  status text not null default 'invited',
  invited_email extensions.citext,
  invited_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_memberships_tenant_id_id_key unique (tenant_id, id),
  constraint tenant_memberships_role_check check (role in ('hostel_admin', 'staff')),
  constraint tenant_memberships_status_check check (status in ('invited', 'active', 'revoked')),
  -- Staff need a permission set; hostel admins hold every permission implicitly.
  constraint tenant_memberships_role_permission_set check (
    (role = 'staff' and permission_set_id is not null) or (role = 'hostel_admin' and permission_set_id is null)
  ),
  constraint tenant_memberships_active_has_user check (status <> 'active' or user_id is not null),
  constraint tenant_memberships_invited_has_email check (status <> 'invited' or invited_email is not null),
  constraint tenant_memberships_revoked_has_timestamp check (status <> 'revoked' or revoked_at is not null)
);

create unique index tenant_memberships_tenant_user_key on public.tenant_memberships (tenant_id, user_id) where user_id is not null;
create unique index tenant_memberships_open_invite_key on public.tenant_memberships (tenant_id, invited_email) where status = 'invited';
-- Backs app.is_tenant_member / app.has_permission (task 4).
create index tenant_memberships_active_user_idx on public.tenant_memberships (user_id, tenant_id) where status = 'active';

-- A staff member's permission set must be a system set or one of the same tenant's sets.
create function app.check_membership_permission_set()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.permission_set_id is not null and not exists (
    select 1 from public.permission_sets ps
    where ps.id = new.permission_set_id
      and (ps.tenant_id is null or ps.tenant_id = new.tenant_id)
  ) then
    raise exception 'permission set % does not belong to tenant %', new.permission_set_id, new.tenant_id
      using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger tenant_memberships_check_permission_set
  before insert or update of permission_set_id, tenant_id on public.tenant_memberships
  for each row execute function app.check_membership_permission_set();

-- A person's relationship with one hostel (applicant -> resident -> former).
create table public.residents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  -- Null for walk-in records created by staff before the student has an account.
  user_id uuid references auth.users (id) on delete set null,
  full_name text not null,
  email extensions.citext,
  phone_e164 text,
  gender text,
  institution text,
  programme text,
  level text,
  student_id_number text,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relationship text,
  status text not null default 'applicant',
  blocked_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint residents_tenant_id_id_key unique (tenant_id, id),
  constraint residents_full_name_length check (char_length(btrim(full_name)) between 2 and 120),
  constraint residents_contact_required check (email is not null or phone_e164 is not null),
  constraint residents_email_format check (email is null or email::text ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint residents_phone_e164 check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  constraint residents_emergency_phone_e164 check (emergency_contact_phone is null or emergency_contact_phone ~ '^\+[1-9][0-9]{7,14}$'),
  constraint residents_gender_check check (gender is null or gender in ('female', 'male', 'undisclosed')),
  constraint residents_status_check check (status in ('applicant', 'active', 'former', 'blocked')),
  constraint residents_blocked_has_reason check (status <> 'blocked' or nullif(btrim(blocked_reason), '') is not null)
);

create unique index residents_tenant_user_key on public.residents (tenant_id, user_id) where user_id is not null;
create index residents_user_idx on public.residents (user_id) where user_id is not null;
create index residents_tenant_status_idx on public.residents (tenant_id, status);
create index residents_tenant_name_idx on public.residents (tenant_id, lower(full_name));
create index residents_tenant_phone_idx on public.residents (tenant_id, phone_e164);

comment on table public.residents is 'A student''s record with one hostel. Personal data never crosses tenants.';

create trigger user_profiles_set_updated_at before update on public.user_profiles
  for each row execute function app.set_updated_at();
create trigger permission_sets_set_updated_at before update on public.permission_sets
  for each row execute function app.set_updated_at();
create trigger tenant_memberships_set_updated_at before update on public.tenant_memberships
  for each row execute function app.set_updated_at();
create trigger residents_set_updated_at before update on public.residents
  for each row execute function app.set_updated_at();

alter table public.user_profiles enable row level security;
alter table public.user_profiles force row level security;
alter table public.permission_sets enable row level security;
alter table public.permission_sets force row level security;
alter table public.tenant_memberships enable row level security;
alter table public.tenant_memberships force row level security;
alter table public.residents enable row level security;
alter table public.residents force row level security;

revoke all on public.user_profiles, public.permission_sets, public.tenant_memberships, public.residents
  from anon, authenticated;

-- Postgres grants EXECUTE on new functions to PUBLIC, and per-schema default privileges cannot
-- remove that global default, so revoke explicitly. Explicit grants above/below are kept.
revoke execute on all functions in schema app from public;
