-- Data integrity rules from docs/DATABASE_DESIGN.md §4.1-4.2 that the database itself enforces.
begin;
select plan(27);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'admin@a.example'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'staff@b.example');

insert into public.tenants (id, slug, name, reference_prefix, status) values
  ('a0000000-0000-4000-8000-00000000000a', 'hostel-a', 'Hostel A', 'HA', 'active'),
  ('b0000000-0000-4000-8000-00000000000b', 'hostel-b', 'Hostel B', 'HB', 'active');

-- Tenants
select throws_ok($$insert into public.tenants (slug, name, reference_prefix) values ('Bad Slug!', 'X Hostel', 'XA')$$,
  '23514', null, 'slug must be lowercase letters, digits and hyphens');
select throws_ok($$insert into public.tenants (slug, name, reference_prefix) values ('app', 'App Hostel', 'XB')$$,
  '23514', null, 'reserved platform subdomains cannot be tenant slugs');
select throws_ok($$insert into public.tenants (slug, name, reference_prefix) values ('hostel-a', 'Dup', 'XC')$$,
  '23505', null, 'slugs are unique');
select throws_ok($$insert into public.tenants (slug, name, reference_prefix) values ('hostel-c', 'Hostel C', 'ha')$$,
  '23514', null, 'reference prefix must be 2-4 capital letters');
select throws_ok($$update public.tenants set status = 'suspended' where slug = 'hostel-a'$$,
  '23514', null, 'suspending a tenant requires a timestamp and reason');
select lives_ok($$update public.tenants set status = 'suspended', suspended_at = now(), suspension_reason = 'Unpaid invoice' where slug = 'hostel-a'$$,
  'suspension with reason is accepted');

-- Domains
select lives_ok($$insert into public.tenant_domains (tenant_id, hostname, kind, is_primary) values ('a0000000-0000-4000-8000-00000000000a', 'book.hostel-a.com.gh', 'custom', true)$$,
  'valid custom domain is accepted');
select throws_ok($$insert into public.tenant_domains (tenant_id, hostname, kind) values ('b0000000-0000-4000-8000-00000000000b', 'book.hostel-a.com.gh', 'custom')$$,
  '23505', null, 'a hostname can belong to only one live tenant domain');
select throws_ok($$insert into public.tenant_domains (tenant_id, hostname, kind) values ('a0000000-0000-4000-8000-00000000000a', 'https://x.com/path', 'custom')$$,
  '23514', null, 'hostnames cannot contain scheme or path');
select throws_ok($$insert into public.tenant_domains (tenant_id, hostname, kind) values ('a0000000-0000-4000-8000-00000000000a', 'Upper.Example.com', 'custom')$$,
  '23514', null, 'hostnames are stored lowercase');
select throws_ok($$insert into public.tenant_domains (tenant_id, hostname, kind, is_primary) values ('a0000000-0000-4000-8000-00000000000a', 'hostel-a.adestay.test', 'platform_subdomain', true)$$,
  '23505', null, 'a tenant has at most one primary domain');
select throws_ok($$insert into public.tenant_domains (tenant_id, hostname, kind, status) values ('a0000000-0000-4000-8000-00000000000a', 'x.hostel-a.com', 'custom', 'verified')$$,
  '23514', null, 'a verified domain needs verified_at');

-- Profiles and settings
select throws_ok($$insert into public.tenant_profiles (tenant_id, display_name, contact_phone) values ('a0000000-0000-4000-8000-00000000000a', 'Hostel A', '0241234567')$$,
  '23514', null, 'phone numbers must be stored in E.164 (+233...)');
select throws_ok($$insert into public.tenant_profiles (tenant_id, display_name, primary_color) values ('b0000000-0000-4000-8000-00000000000b', 'Hostel B', 'green')$$,
  '23514', null, 'brand colours must be #rrggbb');
select throws_ok($$insert into public.tenant_settings (tenant_id, hold_duration_hours) values ('a0000000-0000-4000-8000-00000000000a', 2)$$,
  '23514', null, 'hold duration must be between 24 hours and 14 days');
select throws_ok($$insert into public.tenant_settings (tenant_id, deposit_policy, deposit_value) values ('a0000000-0000-4000-8000-00000000000a', 'percent', 150)$$,
  '23514', null, 'percentage deposits cannot exceed 100');

-- Permission sets
select is((select count(*)::int from public.permission_sets where is_system), 4, 'four system permission sets exist');
select throws_ok($$insert into public.permission_sets (tenant_id, key, name, permissions) values ('a0000000-0000-4000-8000-00000000000a', 'bad_set', 'Bad', array['bookings.read', 'rooms.delete_everything'])$$,
  '23514', null, 'permissions outside the catalog are rejected');
select throws_ok($$insert into public.permission_sets (tenant_id, key, name, permissions) values ('a0000000-0000-4000-8000-00000000000a', 'escalate', 'Escalate', array['staff.manage'])$$,
  '23514', null, 'staff.manage cannot be delegated to a staff permission set');
select throws_ok($$insert into public.permission_sets (tenant_id, key, name, permissions) values ('a0000000-0000-4000-8000-00000000000a', 'gateway', 'Gateway', array['payments.configure'])$$,
  '23514', null, 'payments.configure cannot be delegated to a staff permission set');
select throws_ok($$insert into public.permission_sets (tenant_id, key, name, permissions) values ('a0000000-0000-4000-8000-00000000000a', 'dupes', 'Dupes', array['bookings.read', 'bookings.read'])$$,
  '23514', null, 'duplicate permissions are rejected');

-- Memberships
insert into public.permission_sets (id, tenant_id, key, name, permissions) values
  ('c0000000-0000-4000-8000-0000000000b1', 'b0000000-0000-4000-8000-00000000000b', 'night_porter', 'Night porter', array['checkin.manage']);

select throws_ok($$insert into public.tenant_memberships (tenant_id, user_id, role, status) values ('a0000000-0000-4000-8000-00000000000a', 'bbbbbbbb-0000-4000-8000-000000000002', 'staff', 'active')$$,
  '23514', null, 'staff members need a permission set');
select throws_ok($$insert into public.tenant_memberships (tenant_id, user_id, role, permission_set_id, status) values ('a0000000-0000-4000-8000-00000000000a', 'bbbbbbbb-0000-4000-8000-000000000002', 'staff', 'c0000000-0000-4000-8000-0000000000b1', 'active')$$,
  '23503', null, 'a staff member cannot be given another tenant''s permission set');
select lives_ok($$insert into public.tenant_memberships (tenant_id, user_id, role, status) values ('a0000000-0000-4000-8000-00000000000a', 'aaaaaaaa-0000-4000-8000-000000000001', 'hostel_admin', 'active')$$,
  'a hostel admin needs no permission set');
select throws_ok($$insert into public.tenant_memberships (tenant_id, user_id, role, status) values ('a0000000-0000-4000-8000-00000000000a', 'aaaaaaaa-0000-4000-8000-000000000001', 'hostel_admin', 'active')$$,
  '23505', null, 'a user has one membership per tenant');

-- Residents
select throws_ok($$insert into public.residents (tenant_id, full_name) values ('a0000000-0000-4000-8000-00000000000a', 'No Contact')$$,
  '23514', null, 'a resident needs an email or phone number');

-- Break-glass grants are capped at 4 hours
select throws_ok($$insert into public.platform_access_grants (platform_admin_user_id, tenant_id, reason, expires_at) values ('aaaaaaaa-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-00000000000a', 'Investigating payment issue', now() + interval '1 day')$$,
  '23514', null, 'break-glass access cannot exceed 4 hours');

select * from finish();
rollback;
