-- Phase 1, task 3. Tenancy: hostels, domains, public profile, private settings, platform admins.
-- Design: docs/DATABASE_DESIGN.md §4.1, docs/adr/0001-tenant-isolation.md, docs/adr/0005-domain-resolution.md.
-- RLS is enabled and forced here with no policies (deny by default). Policies and API grants: task 4....

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug extensions.citext not null,
  name text not null,
  legal_name text,
  reference_prefix text not null,
  status text not null default 'onboarding',
  suspended_at timestamptz,
  suspension_reason text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenants_slug_key unique (slug),
  constraint tenants_reference_prefix_key unique (reference_prefix),
  -- Subdomain-safe: 3-40 chars, lowercase letters, digits and inner hyphens.
  constraint tenants_slug_format check (slug::text ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  -- Hosts used by the platform itself can never be a tenant subdomain.
  constraint tenants_slug_not_reserved check (slug::text not in ('app', 'www', 'api', 'admin', 'platform', 'mail', 'staging', 'status', 'help', 'support')),
  constraint tenants_name_length check (char_length(name) between 2 and 120),
  constraint tenants_reference_prefix_format check (reference_prefix ~ '^[A-Z]{2,4}$'),
  constraint tenants_status_check check (status in ('onboarding', 'active', 'suspended', 'archived')),
  constraint tenants_suspension_has_reason check (
    status <> 'suspended' or (suspended_at is not null and nullif(btrim(suspension_reason), '') is not null)
  )
);

comment on table public.tenants is 'One row per hostel business (tenant).';

create table public.tenant_domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  hostname extensions.citext not null,
  kind text not null,
  status text not null default 'pending',
  is_primary boolean not null default false,
  verification jsonb,
  verified_at timestamptz,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_domains_tenant_id_id_key unique (tenant_id, id),
  -- Stored lowercase, no scheme, port or path.
  constraint tenant_domains_hostname_format check (
    hostname::text = lower(hostname::text)
    and hostname::text ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
    and char_length(hostname::text) <= 253
  ),
  constraint tenant_domains_kind_check check (kind in ('platform_subdomain', 'custom')),
  constraint tenant_domains_status_check check (status in ('pending', 'verified', 'failed', 'removed')),
  constraint tenant_domains_verified_has_timestamp check (status <> 'verified' or verified_at is not null)
);

-- A hostname belongs to at most one live tenant domain.
create unique index tenant_domains_hostname_live_key on public.tenant_domains (hostname) where status <> 'removed';
-- At most one primary domain per tenant.
create unique index tenant_domains_one_primary_key on public.tenant_domains (tenant_id) where is_primary and status <> 'removed';

create table public.tenant_profiles (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  display_name text not null,
  tagline text,
  about text,
  logo_path text,
  hero_image_path text,
  primary_color text,
  accent_color text,
  contact_phone text,
  contact_email extensions.citext,
  whatsapp_phone text,
  address text,
  digital_address text,
  landmark_directions text,
  map_url text,
  policies_md text,
  terms_md text,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_profiles_display_name_length check (char_length(display_name) between 2 and 120),
  constraint tenant_profiles_primary_color_format check (primary_color is null or primary_color ~ '^#[0-9a-f]{6}$'),
  constraint tenant_profiles_accent_color_format check (accent_color is null or accent_color ~ '^#[0-9a-f]{6}$'),
  constraint tenant_profiles_contact_phone_e164 check (contact_phone is null or contact_phone ~ '^\+[1-9][0-9]{7,14}$'),
  constraint tenant_profiles_whatsapp_phone_e164 check (whatsapp_phone is null or whatsapp_phone ~ '^\+[1-9][0-9]{7,14}$'),
  constraint tenant_profiles_contact_email_format check (contact_email is null or contact_email::text ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  -- Ghana Post GPS digital address, e.g. GA-123-4567.
  constraint tenant_profiles_digital_address_format check (digital_address is null or digital_address ~ '^[A-Z]{2}-[0-9]{3,4}-[0-9]{4}$'),
  constraint tenant_profiles_map_url_https check (map_url is null or map_url ~ '^https://')
);

comment on table public.tenant_profiles is 'Public-facing hostel content shown on the tenant website.';

create table public.tenant_settings (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  hold_duration_hours integer not null default 120,
  hold_extension_max smallint not null default 1,
  require_payment_before_allocation boolean not null default false,
  deposit_policy text not null default 'fixed',
  deposit_value integer not null default 0,
  min_paid_percent_for_checkin smallint not null default 100,
  late_fee_policy jsonb,
  booking_requires_verified_email boolean not null default true,
  student_id_required boolean not null default false,
  gender_policy_enforced boolean not null default false,
  timezone text not null default 'Africa/Accra',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Hold rules approved in docs/BOOKING_AND_PAYMENT_FLOWS.md §3: 24 h to 14 days.
  constraint tenant_settings_hold_duration_range check (hold_duration_hours between 24 and 336),
  constraint tenant_settings_hold_extension_range check (hold_extension_max between 0 and 3),
  constraint tenant_settings_deposit_policy_check check (deposit_policy in ('none', 'fixed', 'percent', 'full')),
  constraint tenant_settings_deposit_value_check check (
    deposit_value >= 0 and (deposit_policy <> 'percent' or deposit_value <= 100)
  ),
  constraint tenant_settings_min_paid_percent_range check (min_paid_percent_for_checkin between 0 and 100)
);

comment on table public.tenant_settings is 'Private operational settings for a hostel. Not public.';

create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint platform_admins_revoked_after_granted check (revoked_at is null or revoked_at >= granted_at)
);

comment on table public.platform_admins is 'Platform super admins. Granted only by migration or CLI script, never through the API.';

create table public.platform_access_grants (
  id uuid primary key default gen_random_uuid(),
  platform_admin_user_id uuid not null references auth.users (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  reason text not null,
  ticket_ref text,
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint platform_access_grants_tenant_id_id_key unique (tenant_id, id),
  constraint platform_access_grants_reason_length check (char_length(btrim(reason)) >= 10),
  -- Break-glass access is short-lived: at most 4 hours (SECURITY_THREAT_MODEL §6).
  constraint platform_access_grants_max_4_hours check (
    expires_at > granted_at and expires_at <= granted_at + interval '4 hours'
  )
);

create index platform_access_grants_admin_tenant_idx
  on public.platform_access_grants (platform_admin_user_id, tenant_id, expires_at);

comment on table public.platform_access_grants is 'Audited, time-limited read access for a platform admin to one tenant.';

-- updated_at maintenance
create trigger tenants_set_updated_at before update on public.tenants
  for each row execute function app.set_updated_at();
create trigger tenant_domains_set_updated_at before update on public.tenant_domains
  for each row execute function app.set_updated_at();
create trigger tenant_profiles_set_updated_at before update on public.tenant_profiles
  for each row execute function app.set_updated_at();
create trigger tenant_settings_set_updated_at before update on public.tenant_settings
  for each row execute function app.set_updated_at();

-- Deny by default: RLS on (and forced for the table owner), no API privileges until task 4 adds policies.
alter table public.tenants enable row level security;
alter table public.tenants force row level security;
alter table public.tenant_domains enable row level security;
alter table public.tenant_domains force row level security;
alter table public.tenant_profiles enable row level security;
alter table public.tenant_profiles force row level security;
alter table public.tenant_settings enable row level security;
alter table public.tenant_settings force row level security;
alter table public.platform_admins enable row level security;
alter table public.platform_admins force row level security;
alter table public.platform_access_grants enable row level security;
alter table public.platform_access_grants force row level security;

revoke all on public.tenants, public.tenant_domains, public.tenant_profiles, public.tenant_settings,
  public.platform_admins, public.platform_access_grants
  from anon, authenticated;
