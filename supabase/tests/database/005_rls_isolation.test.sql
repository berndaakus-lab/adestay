-- Tenant isolation and role matrix (docs/RBAC_MATRIX.md §4, Phase 1 acceptance criteria 2, 4, 5).
-- Every query below runs as the API role with a forged-but-valid JWT, exactly as PostgREST would.
begin;
select plan(53);

-- ---------------------------------------------------------------------------
-- Test helpers: impersonate a user (role + JWT claims) for the rest of the transaction.
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.as_user(p_user uuid, p_aal text default 'aal1') returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true);
  execute 'set local role authenticated';
end $$;

create function tests.as_anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  execute 'set local role anon';
end $$;

create function tests.as_owner() returns void
language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

grant execute on all functions in schema tests to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures (as the migration owner)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin@a.test'),
  ('00000000-0000-4000-8000-0000000000a2', 'frontdesk@a.test'),
  ('00000000-0000-4000-8000-0000000000a3', 'accounts@a.test'),
  ('00000000-0000-4000-8000-0000000000b1', 'admin@b.test'),
  ('00000000-0000-4000-8000-0000000000c1', 'admin@s.test'),
  ('00000000-0000-4000-8000-0000000000d1', 'student@a.test'),
  ('00000000-0000-4000-8000-0000000000d2', 'student@s.test'),
  ('00000000-0000-4000-8000-0000000000e1', 'platform@adestay.test'),
  ('00000000-0000-4000-8000-0000000000f1', 'outsider@example.com');

insert into public.tenants (id, slug, name, reference_prefix, status, suspended_at, suspension_reason) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'hostel-a', 'Hostel A', 'HA', 'active', null, null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'hostel-b', 'Hostel B', 'HB', 'active', null, null),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'hostel-s', 'Hostel S', 'HS', 'suspended', now(), 'Unpaid subscription');

insert into public.tenant_domains (tenant_id, hostname, kind, status, is_primary, verified_at) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'hostel-a.adestay.test', 'platform_subdomain', 'verified', true, now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'book.hostel-b.com', 'custom', 'pending', true, null),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'hostel-s.adestay.test', 'platform_subdomain', 'verified', true, now());

insert into public.tenant_profiles (tenant_id, display_name, is_published) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Hostel A', true),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Hostel B', false),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Hostel S', true);

insert into public.tenant_settings (tenant_id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

insert into public.permission_sets (id, tenant_id, key, name, permissions) values
  ('99999999-0000-4000-8000-0000000000a9', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'night_porter', 'Night porter', array['checkin.manage']);

insert into public.tenant_memberships (tenant_id, user_id, role, permission_set_id, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a1', 'hostel_admin', null, 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a2', 'staff',
     (select id from public.permission_sets where key = 'front_desk' and is_system), 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a3', 'staff',
     (select id from public.permission_sets where key = 'accounts' and is_system), 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-4000-8000-0000000000b1', 'hostel_admin', null, 'active'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '00000000-0000-4000-8000-0000000000c1', 'hostel_admin', null, 'active');

insert into public.residents (id, tenant_id, user_id, full_name, email, emergency_contact_name, student_id_number) values
  ('11111111-0000-4000-8000-0000000000a1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000d1',
     'Ama Mensah', 'student@a.test', 'Kofi Mensah', 'UG10293847'),
  ('11111111-0000-4000-8000-0000000000b1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', null,
     'Yaw Boateng', 'yaw@b.test', 'Akua Boateng', null),
  ('11111111-0000-4000-8000-0000000000c1', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '00000000-0000-4000-8000-0000000000d2',
     'Efua Asante', 'student@s.test', null, null);

insert into public.platform_admins (user_id) values ('00000000-0000-4000-8000-0000000000e1');
-- Active break-glass grant on B; an expired one on A.
insert into public.platform_access_grants (platform_admin_user_id, tenant_id, reason, granted_at, expires_at) values
  ('00000000-0000-4000-8000-0000000000e1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Investigating a payment complaint', now() - interval '10 minutes', now() + interval '1 hour'),
  ('00000000-0000-4000-8000-0000000000e1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Old support ticket, now closed', now() - interval '5 hours', now() - interval '2 hours');

-- ---------------------------------------------------------------------------
-- Anonymous visitor
-- ---------------------------------------------------------------------------
select tests.as_anon();
select throws_ok('select * from public.tenants', '42501', null, 'anon: cannot read tenants');
select throws_ok('select id from public.residents', '42501', null, 'anon: cannot read residents');
select is((select array_agg(display_name order by display_name) from public.tenant_profiles), array['Hostel A'],
  'anon: sees only published profiles of active hostels');
select is((select slug from app.resolve_tenant_by_host('HOSTEL-A.adestay.test:3000')), 'hostel-a',
  'anon: host resolver normalises case and port');
select is((select count(*)::int from app.resolve_tenant_by_host('book.hostel-b.com')), 0,
  'anon: unverified domains do not resolve');
select is((select status from app.resolve_tenant_by_host('hostel-s.adestay.test')), 'suspended',
  'anon: suspended hostel resolves with its status so the site can say "unavailable"');
select tests.as_owner();

-- ---------------------------------------------------------------------------
-- Signed-in user with no relationship to any hostel
-- ---------------------------------------------------------------------------
select tests.as_user('00000000-0000-4000-8000-0000000000f1');
select is((select count(*)::int from public.tenants), 0, 'outsider: no tenants');
select is((select count(*)::int from public.residents), 0, 'outsider: no residents');
select is((select count(*)::int from public.tenant_settings), 0, 'outsider: no settings');
select is((select count(*)::int from public.tenant_memberships), 0, 'outsider: no memberships');
select is((select count(*)::int from public.audit_logs), 0, 'outsider: no audit log');
select is((select count(*)::int from public.user_profiles), 1, 'outsider: only their own profile');
select tests.as_owner();

-- ---------------------------------------------------------------------------
-- Hostel admin of A
-- ---------------------------------------------------------------------------
select tests.as_user('00000000-0000-4000-8000-0000000000a1');
select is((select array_agg(slug::text) from public.tenants), array['hostel-a'], 'admin A: sees only hostel A');
select is((select array_agg(full_name) from public.residents), array['Ama Mensah'], 'admin A: sees only A residents');
select is((select count(*)::int from public.tenant_settings), 1, 'admin A: sees A settings only');
select is((select count(*)::int from public.tenant_memberships), 3, 'admin A: sees the 3 A memberships');
select is((select count(*)::int from public.audit_logs where tenant_id <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0,
  'admin A: audit log contains no other tenant');
select ok((select count(*) from public.audit_logs) > 0, 'admin A: can read A audit log');
select is((select count(*)::int from public.tenant_domains), 1, 'admin A: sees only A domains');
select is((select count(*)::int from public.platform_access_grants where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 1,
  'admin A: can see break-glass grants on A (transparency)');
select is((select count(*)::int from public.platform_access_grants where tenant_id <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0,
  'admin A: cannot see grants on other tenants');
select throws_ok('select emergency_contact_name from public.residents', '42501', null,
  'admin A: sensitive columns are not readable through normal queries');
select is((select emergency_contact_name from public.get_resident_sensitive('11111111-0000-4000-8000-0000000000a1')), 'Kofi Mensah',
  'admin A: reads sensitive fields of an A resident through the checked function');
select is((select count(*)::int from public.get_resident_sensitive('11111111-0000-4000-8000-0000000000b1')), 0,
  'admin A: gets nothing for a B resident (IDOR)');
update public.tenant_profiles set tagline = 'Updated by A' where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select lives_ok($$update public.tenant_profiles set tagline = 'Calm rooms' where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  'admin A: can update A profile');
select throws_ok($$insert into public.tenant_memberships (tenant_id, user_id, role, status) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000f1', 'hostel_admin', 'active')$$,
  '42501', null, 'admin A: cannot insert memberships directly (RPC only)');
select lives_ok($$insert into public.permission_sets (tenant_id, key, name, permissions) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cashier', 'Cashier', array['finance.read'])$$,
  'admin A: can create a custom permission set for A');
select throws_ok($$insert into public.permission_sets (tenant_id, key, name, permissions) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cashier', 'Cashier', array['finance.read'])$$,
  '42501', null, 'admin A: cannot create a permission set for B');
select tests.as_owner();
select is((select tagline from public.tenant_profiles where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), null,
  'admin A: an update aimed at B changed nothing');

-- ---------------------------------------------------------------------------
-- Staff of A: front desk (residents.read + read_sensitive) and accounts (no read_sensitive)
-- ---------------------------------------------------------------------------
select tests.as_user('00000000-0000-4000-8000-0000000000a2');
select is((select count(*)::int from public.residents), 1, 'front desk A: sees A residents');
select is((select count(*)::int from public.tenant_settings), 0, 'front desk A: no settings access');
select is((select count(*)::int from public.audit_logs), 0, 'front desk A: no audit access');
select is((select count(*)::int from public.tenant_memberships), 1, 'front desk A: sees only own membership');
select is((select count(*)::int from public.permission_sets), 6, 'front desk A: sees 4 system sets + both A custom sets (night porter, cashier)');
select throws_ok($$insert into public.permission_sets (tenant_id, key, name, permissions) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'sneaky', 'Sneaky', array['bookings.review'])$$,
  '42501', null, 'front desk A: cannot create permission sets');
update public.tenant_profiles set tagline = 'Front desk edit' where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select tests.as_owner();
select is((select tagline from public.tenant_profiles where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'Calm rooms',
  'front desk A: profile update without settings.manage changed nothing');

select tests.as_user('00000000-0000-4000-8000-0000000000a3');
select is((select count(*)::int from public.get_resident_sensitive('11111111-0000-4000-8000-0000000000a1')), 0,
  'accounts A: no sensitive fields without residents.read_sensitive');
select tests.as_owner();

-- ---------------------------------------------------------------------------
-- Hostel admin of B, and of the suspended hostel S
-- ---------------------------------------------------------------------------
select tests.as_user('00000000-0000-4000-8000-0000000000b1');
select is((select array_agg(full_name) from public.residents), array['Yaw Boateng'], 'admin B: sees only B residents');
select is((select count(*)::int from public.permission_sets), 4, 'admin B: does not see A custom sets');
select ok(exists (select 1 from public.audit_logs where action = 'platform_access_grants.created'
                  and tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  'admin B: the platform break-glass grant on B appears in B audit log (acceptance criterion 5)');
select is((select count(*)::int from public.user_profiles where id = '00000000-0000-4000-8000-0000000000a2'), 0,
  'admin B: cannot see A staff profiles');
select tests.as_owner();

select tests.as_user('00000000-0000-4000-8000-0000000000c1');
select is((select count(*)::int from public.tenants), 0, 'suspended admin: loses access to tenant');
select is((select count(*)::int from public.residents), 0, 'suspended admin: loses access to residents');
select tests.as_owner();

-- ---------------------------------------------------------------------------
-- Students
-- ---------------------------------------------------------------------------
select tests.as_user('00000000-0000-4000-8000-0000000000d1');
select is((select array_agg(full_name) from public.residents), array['Ama Mensah'], 'student A: sees only own resident record');
select is((select student_id_number from public.get_resident_sensitive('11111111-0000-4000-8000-0000000000a1')), 'UG10293847',
  'student A: can read own sensitive fields');
select is((select count(*)::int from public.tenant_settings) + (select count(*)::int from public.audit_logs), 0,
  'student A: no settings or audit access');
select tests.as_owner();

select tests.as_user('00000000-0000-4000-8000-0000000000d2');
select is((select count(*)::int from public.residents), 1, 'student of suspended hostel: keeps read access to own record');
select tests.as_owner();

-- ---------------------------------------------------------------------------
-- Platform admin: powerless without MFA; with MFA, tenant data only through break-glass
-- ---------------------------------------------------------------------------
select tests.as_user('00000000-0000-4000-8000-0000000000e1', 'aal1');
select is((select count(*)::int from public.tenants), 0, 'platform admin without MFA (aal1): no platform access');
select tests.as_owner();

select tests.as_user('00000000-0000-4000-8000-0000000000e1', 'aal2');
select is((select count(*)::int from public.tenants), 3, 'platform admin with MFA: sees all tenants');
select is((select array_agg(full_name) from public.residents), array['Yaw Boateng'],
  'platform admin: residents only for the tenant with an active break-glass grant (B, not expired A)');
select throws_ok($$insert into public.platform_admins (user_id) values ('00000000-0000-4000-8000-0000000000f1')$$,
  '42501', null, 'platform admin: cannot create platform admins through the API');
select lives_ok($$insert into public.platform_access_grants (platform_admin_user_id, tenant_id, reason, expires_at) values ('00000000-0000-4000-8000-0000000000e1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'New ticket ADS-42 about check-in', now() + interval '1 hour')$$,
  'platform admin: can open a break-glass grant for themself');
select tests.as_owner();

-- ---------------------------------------------------------------------------
-- Revocation takes effect on the very next query (no JWT claims involved)
-- ---------------------------------------------------------------------------
update public.tenant_memberships set status = 'revoked', revoked_at = now()
  where user_id = '00000000-0000-4000-8000-0000000000a2';
select tests.as_user('00000000-0000-4000-8000-0000000000a2');
select is((select count(*)::int from public.residents), 0, 'revoked staff: access gone immediately');
select tests.as_owner();

select * from finish();
rollback;
