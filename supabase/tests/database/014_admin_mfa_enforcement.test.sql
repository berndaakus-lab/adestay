-- Hostel-admin MFA is enforced by the database, not only the app (ADR-0002, SECURITY_THREAT_MODEL T4).
begin;
select plan(30);

create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.as_user(p_user uuid, p_aal text default 'aal1') returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true);
  execute 'set local role authenticated';
end $$;

create function tests.as_owner() returns void
language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

grant execute on all functions in schema tests to anon, authenticated;

-- a1 admin of A and resident of B; a2 front desk of A (no MFA needed); x1 admin of A and staff of B;
-- p1 platform admin account who is also staff of B; s1 admin of suspended S and staff of A.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin@a.test'),
  ('00000000-0000-4000-8000-0000000000a2', 'frontdesk@a.test'),
  ('00000000-0000-4000-8000-0000000000b1', 'admin@b.test'),
  ('00000000-0000-4000-8000-0000000000c1', 'x@a.test'),
  ('00000000-0000-4000-8000-0000000000d1', 'platform@adestay.test'),
  ('00000000-0000-4000-8000-0000000000e1', 'suspended-admin@s.test');

insert into public.tenants (id, slug, name, reference_prefix, status, suspended_at, suspension_reason) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'hostel-a', 'Hostel A', 'HA', 'active', null, null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'hostel-b', 'Hostel B', 'HB', 'active', null, null),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'hostel-s', 'Hostel S', 'HS', 'suspended', now(), 'Unpaid subscription');

insert into public.tenant_profiles (tenant_id, display_name, is_published) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Hostel A', false);
insert into public.tenant_settings (tenant_id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

insert into public.tenant_memberships (tenant_id, user_id, role, permission_set_id, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a1', 'hostel_admin', null, 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a2', 'staff',
     (select id from public.permission_sets where key = 'front_desk' and is_system), 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-4000-8000-0000000000b1', 'hostel_admin', null, 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000c1', 'hostel_admin', null, 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-4000-8000-0000000000c1', 'staff',
     (select id from public.permission_sets where key = 'front_desk' and is_system), 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-4000-8000-0000000000d1', 'staff',
     (select id from public.permission_sets where key = 'front_desk' and is_system), 'active'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '00000000-0000-4000-8000-0000000000e1', 'hostel_admin', null, 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000e1', 'staff',
     (select id from public.permission_sets where key = 'front_desk' and is_system), 'active');

insert into public.platform_admins (user_id) values ('00000000-0000-4000-8000-0000000000d1');

insert into public.residents (id, tenant_id, user_id, full_name, email) values
  ('11111111-0000-4000-8000-0000000000a1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, 'Ama Mensah', 'ama@a.test'),
  ('11111111-0000-4000-8000-0000000000b1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-4000-8000-0000000000a1', 'Admin As Student', 'admin@a.test');

insert into public.room_types (id, tenant_id, name, slug, occupancy) values
  ('20000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Double', 'double', 2);
insert into public.rooms (tenant_id, room_type_id, label) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-0000000000a1', 'A-101');
insert into public.booking_periods (tenant_id, name, kind, starts_on, ends_on, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Year', 'academic_year', '2026-09-01', '2027-07-31', 'draft');

-- ---------------------------------------------------------------------------------------------
-- Hostel admin with a password-only session (aal1)
-- ---------------------------------------------------------------------------------------------
select tests.as_user('00000000-0000-4000-8000-0000000000a1', 'aal1');
select ok(not app.is_tenant_member('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'admin aal1: not a member yet');
select ok(not app.is_hostel_admin('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'admin aal1: not an admin yet');
select ok(not app.has_permission('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'inventory.read'), 'admin aal1: holds no permissions');
select is((select count(*)::int from public.rooms), 0, 'admin aal1: cannot read rooms');
select is((select count(*)::int from public.tenant_settings), 0, 'admin aal1: cannot read settings');
select is((select count(*)::int from public.residents where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0,
  'admin aal1: cannot read residents');
select is((select count(*)::int from public.audit_logs), 0, 'admin aal1: cannot read the audit log');
select is((select count(*)::int from public.booking_periods), 0, 'admin aal1: cannot read draft periods');
select is((select count(*)::int from public.room_type_capacity('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')), 0,
  'admin aal1: no capacity figures');
select throws_ok($$insert into public.room_types (tenant_id, name, slug, occupancy)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'No MFA', 'no-mfa', 2)$$, '42501', null, 'admin aal1: cannot write inventory');
with u as (update public.tenant_profiles set tagline = 'No MFA' returning 1)
select is((select count(*)::int from u), 0, 'admin aal1: cannot edit the profile');
select throws_ok($$select public.invite_staff_member('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'new@example.test', 'hostel_admin')$$,
  '42501', null, 'admin aal1: cannot invite an admin');
select ok(not public.can_upload_public_asset('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/branding/logo-a0000001.webp'),
  'admin aal1: cannot upload');
select is((select array_agg(role) from public.my_memberships()), array['hostel_admin'],
  'admin aal1: my_memberships still shows the role, so the app can send them to MFA');
select is((select id from public.residents where user_id = '00000000-0000-4000-8000-0000000000a1'),
  '11111111-0000-4000-8000-0000000000b1'::uuid, 'admin aal1: still sees their own student record at another hostel');
select tests.as_owner();

-- ---------------------------------------------------------------------------------------------
-- The same admin after MFA (aal2)
-- ---------------------------------------------------------------------------------------------
select tests.as_user('00000000-0000-4000-8000-0000000000a1', 'aal2');
select ok(app.is_hostel_admin('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'admin aal2: is an admin');
select is((select count(*)::int from public.rooms), 1, 'admin aal2: reads rooms');
select lives_ok($$insert into public.room_types (tenant_id, name, slug, occupancy)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'With MFA', 'with-mfa', 2)$$, 'admin aal2: can write inventory');
select ok(public.can_upload_public_asset('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/branding/logo-a0000001.webp'),
  'admin aal2: can upload');
select tests.as_owner();

-- ---------------------------------------------------------------------------------------------
-- Other accounts (same rule as src/lib/mfa-policy.ts)
-- ---------------------------------------------------------------------------------------------
select tests.as_user('00000000-0000-4000-8000-0000000000a2', 'aal1');
select ok(app.is_tenant_member('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'ordinary staff aal1: keeps access (MFA is optional)');
select is((select count(*)::int from public.rooms), 1, 'ordinary staff aal1: reads rooms with inventory.read');
select ok(not app.has_permission('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'inventory.manage'), 'ordinary staff aal1: only their set');
select tests.as_owner();

select tests.as_user('00000000-0000-4000-8000-0000000000c1', 'aal1');
select ok(not app.has_permission('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'inventory.read'), 'admin of A, aal1: nothing at A');
select ok(not app.has_permission('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'inventory.read'),
  'admin of A who is staff at B, aal1: nothing at B either');
select tests.as_owner();

select tests.as_user('00000000-0000-4000-8000-0000000000c1', 'aal2');
select ok(app.has_permission('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'inventory.read'), 'the same person at aal2: staff access at B');
select tests.as_owner();

select tests.as_user('00000000-0000-4000-8000-0000000000d1', 'aal1');
select ok(not app.is_tenant_member('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 'platform admin account who is staff, aal1: no staff access');
select tests.as_owner();

select tests.as_user('00000000-0000-4000-8000-0000000000d1', 'aal2');
select ok(app.is_tenant_member('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 'platform admin account who is staff, aal2: staff access');
select tests.as_owner();

select tests.as_user('00000000-0000-4000-8000-0000000000e1', 'aal1');
select ok(app.is_tenant_member('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'admin of a suspended hostel who is staff elsewhere, aal1: same as the app, no MFA demanded');
select ok(not app.is_hostel_admin('cccccccc-cccc-4ccc-8ccc-cccccccccccc'), 'and still no admin access at the suspended hostel');
select tests.as_owner();

select ok(not has_function_privilege('authenticated', 'app.caller_meets_mfa_policy()', 'execute'),
  'the MFA helper is internal');

select * from finish();
rollback;
