-- Phase 2, task 1. Inventory and pricing: constraints, isolation and RBAC
-- (docs/DATABASE_DESIGN.md §4.3, docs/RBAC_MATRIX.md §4, Phase 2 acceptance criterion 6).
-- Queries run as the API roles with JWT claims, exactly as PostgREST would.
begin;
select plan(54);

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

-- ---------------------------------------------------------------------------------------------
-- Fixtures: hostels A and B active, S suspended
-- ---------------------------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin@a.test'),
  ('00000000-0000-4000-8000-0000000000a2', 'frontdesk@a.test'),
  ('00000000-0000-4000-8000-0000000000a3', 'accounts@a.test'),
  ('00000000-0000-4000-8000-0000000000a4', 'manager@a.test'),
  ('00000000-0000-4000-8000-0000000000b1', 'admin@b.test'),
  ('00000000-0000-4000-8000-0000000000c1', 'admin@s.test'),
  ('00000000-0000-4000-8000-0000000000e1', 'platform@adestay.test'),
  ('00000000-0000-4000-8000-0000000000f1', 'outsider@example.com');

insert into public.tenants (id, slug, name, reference_prefix, status, suspended_at, suspension_reason) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'hostel-a', 'Hostel A', 'HA', 'active', null, null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'hostel-b', 'Hostel B', 'HB', 'active', null, null),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'hostel-s', 'Hostel S', 'HS', 'suspended', now(), 'Unpaid subscription');

insert into public.tenant_memberships (tenant_id, user_id, role, permission_set_id, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a1', 'hostel_admin', null, 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a2', 'staff',
     (select id from public.permission_sets where key = 'front_desk' and is_system), 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a3', 'staff',
     (select id from public.permission_sets where key = 'accounts' and is_system), 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a4', 'staff',
     (select id from public.permission_sets where key = 'manager' and is_system), 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-4000-8000-0000000000b1', 'hostel_admin', null, 'active'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '00000000-0000-4000-8000-0000000000c1', 'hostel_admin', null, 'active');

insert into public.platform_admins (user_id) values ('00000000-0000-4000-8000-0000000000e1');
insert into public.platform_access_grants (platform_admin_user_id, tenant_id, reason, granted_at, expires_at) values
  ('00000000-0000-4000-8000-0000000000e1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Checking a room setup question',
   now() - interval '5 minutes', now() + interval '1 hour');

insert into public.booking_periods (id, tenant_id, name, kind, starts_on, ends_on, status) values
  ('10000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2026/27 Academic Year', 'academic_year', '2026-09-01', '2027-07-31', 'open'),
  ('10000000-0000-4000-8000-0000000000a2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Vacation 2027', 'vacation', '2027-08-01', '2027-08-31', 'draft'),
  ('10000000-0000-4000-8000-0000000000b1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'B Year 2026/27', 'academic_year', '2026-09-01', '2027-07-31', 'open'),
  ('10000000-0000-4000-8000-0000000000b2', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'B Draft period', 'semester', '2027-01-10', '2027-05-31', 'draft'),
  ('10000000-0000-4000-8000-0000000000c1', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'S Year 2026/27', 'academic_year', '2026-09-01', '2027-07-31', 'open');

insert into public.room_types (id, tenant_id, name, slug, occupancy, is_published) values
  ('20000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2 in a room', '2-in-a-room', 2, true),
  ('20000000-0000-4000-8000-0000000000a2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '4 in a room', '4-in-a-room', 4, false),
  ('20000000-0000-4000-8000-0000000000b1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'B Single', 'single', 1, true),
  ('20000000-0000-4000-8000-0000000000b2', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'B Hidden', 'hidden', 2, false),
  ('20000000-0000-4000-8000-0000000000c1', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'S Single', 'single', 1, true);

insert into public.room_type_photos (tenant_id, room_type_id, storage_path, alt_text) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-0000000000a1',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/room-types/20000000-0000-4000-8000-0000000000a1/photo-0001.webp', 'Two beds by a window'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-0000000000a2',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/room-types/20000000-0000-4000-8000-0000000000a2/photo-0002.webp', 'Four bunk beds');

insert into public.rooms (id, tenant_id, room_type_id, label) values
  ('30000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-0000000000a1', 'A-101'),
  ('30000000-0000-4000-8000-0000000000b1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '20000000-0000-4000-8000-0000000000b1', 'B-1');

insert into public.beds (id, tenant_id, room_id, label) values
  ('40000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '30000000-0000-4000-8000-0000000000a1', 'A'),
  ('40000000-0000-4000-8000-0000000000a2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '30000000-0000-4000-8000-0000000000a1', 'B'),
  ('40000000-0000-4000-8000-0000000000b1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '30000000-0000-4000-8000-0000000000b1', 'A');

insert into public.bed_blocks (id, tenant_id, bed_id, blocked, reason) values
  ('50000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '40000000-0000-4000-8000-0000000000a1',
   daterange('2026-09-01', '2026-10-01'), 'Broken window'),
  ('50000000-0000-4000-8000-0000000000b1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '40000000-0000-4000-8000-0000000000b1',
   daterange('2026-09-01', '2026-10-01'), 'Repainting');

insert into public.room_type_prices (tenant_id, room_type_id, booking_period_id, amount_minor, deposit_minor) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a1', 450000, 100000),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-0000000000a2', '10000000-0000-4000-8000-0000000000a1', 300000, 0),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a2', 90000, 0),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '20000000-0000-4000-8000-0000000000b1', '10000000-0000-4000-8000-0000000000b1', 800000, 200000),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '20000000-0000-4000-8000-0000000000b2', '10000000-0000-4000-8000-0000000000b1', 500000, 0),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '20000000-0000-4000-8000-0000000000c1', '10000000-0000-4000-8000-0000000000c1', 700000, 0);

-- ---------------------------------------------------------------------------------------------
-- Constraints (as the owner, so only the database rules apply)
-- ---------------------------------------------------------------------------------------------
select throws_ok($$insert into public.booking_periods (tenant_id, name, kind, starts_on, ends_on)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Backwards', 'semester', '2027-01-10', '2027-01-01')$$,
  '23514', null, 'a period must end after it starts');
select is((select upper(stay) from public.booking_periods where id = '10000000-0000-4000-8000-0000000000a1'), date '2027-08-01',
  'stay is an inclusive date range over the whole period');
select throws_ok($$insert into public.room_type_prices (tenant_id, room_type_id, booking_period_id, amount_minor, deposit_minor)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-0000000000a2', '10000000-0000-4000-8000-0000000000a2', 1000, 2000)$$,
  '23514', null, 'a deposit cannot exceed the price');
select throws_ok($$insert into public.room_type_prices (tenant_id, room_type_id, booking_period_id, amount_minor)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-0000000000a2', '10000000-0000-4000-8000-0000000000a2', 0)$$,
  '23514', null, 'a price must be positive');
select throws_ok($$insert into public.room_type_prices (tenant_id, room_type_id, booking_period_id, amount_minor)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a1', 5000)$$,
  '23505', null, 'one price per room type and period');
select throws_ok($$insert into public.rooms (tenant_id, room_type_id, label)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-0000000000b1', 'A-999')$$,
  '23503', null, 'a room cannot use another hostel''s room type (composite FK)');
select throws_ok($$insert into public.beds (tenant_id, room_id, label)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '30000000-0000-4000-8000-0000000000b1', 'Z')$$,
  '23503', null, 'a bed cannot sit in another hostel''s room (composite FK)');
select throws_ok($$insert into public.room_type_prices (tenant_id, room_type_id, booking_period_id, amount_minor)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-0000000000a2', '10000000-0000-4000-8000-0000000000b1', 5000)$$,
  '23503', null, 'a price cannot use another hostel''s period (composite FK)');
select throws_ok($$insert into public.room_type_photos (tenant_id, room_type_id, storage_path, alt_text)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-0000000000a1',
          'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/room-types/20000000-0000-4000-8000-0000000000a1/photo-9999.webp', 'Wrong folder')$$,
  '23514', null, 'a photo path must be inside the hostel''s own room-type folder');
select throws_ok($$insert into public.room_types (tenant_id, name, slug, occupancy)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Bad slug', 'Bad Slug!', 2)$$,
  '23514', null, 'room type slugs are URL-safe');
select throws_ok($$insert into public.beds (tenant_id, room_id, label)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '30000000-0000-4000-8000-0000000000a1', 'C')$$,
  '23514', null, 'a room cannot have more beds than its room type''s occupancy');
update public.beds set status = 'retired' where id = '40000000-0000-4000-8000-0000000000a2';
select lives_ok($$insert into public.beds (tenant_id, room_id, label)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '30000000-0000-4000-8000-0000000000a1', 'C')$$,
  'retired beds do not count towards occupancy');
select throws_ok($$update public.room_types set occupancy = 1 where id = '20000000-0000-4000-8000-0000000000a1'$$,
  '23514', null, 'occupancy cannot drop below the beds already in a room of that type');
select throws_ok($$update public.beds set status = 'active' where id = '40000000-0000-4000-8000-0000000000a2'$$,
  '23514', null, 're-activating a retired bed is checked against occupancy too');
select throws_ok($$insert into public.bed_blocks (tenant_id, bed_id, blocked, reason)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '40000000-0000-4000-8000-0000000000a1', daterange('2026-09-20', '2026-11-01'), 'Overlap')$$,
  '23P01', null, 'a bed cannot have two live blocks over the same days');
update public.bed_blocks set released_at = now() where id = '50000000-0000-4000-8000-0000000000a1';
select lives_ok($$insert into public.bed_blocks (tenant_id, bed_id, blocked, reason)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '40000000-0000-4000-8000-0000000000a1', daterange('2026-09-20', '2026-11-01'), 'New damage')$$,
  'a released block no longer blocks those days');
select throws_ok($$update public.bed_blocks set reason = 'Rewritten history' where id = '50000000-0000-4000-8000-0000000000a1'$$,
  '23514', null, 'a released block cannot be changed');
select ok(exists (select 1 from public.audit_logs where entity_type = 'room_type_prices'
                    and tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and action = 'room_type_prices.created'),
  'price changes are written to the tenant audit log');

-- ---------------------------------------------------------------------------------------------
-- Anonymous visitor: published content of active hostels only
-- ---------------------------------------------------------------------------------------------
select tests.as_anon();
select is((select array_agg(name order by name) from public.booking_periods),
  array['2026/27 Academic Year', 'B Year 2026/27'], 'anon: open periods of active hostels only');
select is((select array_agg(name order by name) from public.room_types),
  array['2 in a room', 'B Single'], 'anon: published room types of active hostels only');
select is((select count(*)::int from public.room_type_photos), 1, 'anon: photos of published room types only');
select is((select array_agg(amount_minor order by amount_minor) from public.room_type_prices),
  array[450000, 800000]::bigint[], 'anon: prices for published room types in open periods only');
select throws_ok('select id from public.rooms', '42501', null, 'anon: room numbers are not public');
select throws_ok('select id from public.bed_blocks', '42501', null, 'anon: bed blocks are not public');
select throws_ok($$insert into public.room_types (tenant_id, name, slug, occupancy)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Anon type', 'anon-type', 2)$$, '42501', null, 'anon: cannot write');
select tests.as_owner();

-- ---------------------------------------------------------------------------------------------
-- Signed-in outsider: public content only
-- ---------------------------------------------------------------------------------------------
select tests.as_user('00000000-0000-4000-8000-0000000000f1');
select is((select count(*)::int from public.booking_periods), 2, 'outsider: only public periods');
select is((select count(*)::int from public.rooms), 0, 'outsider: no rooms');
select is((select count(*)::int from public.beds), 0, 'outsider: no beds');
select throws_ok($$insert into public.room_types (tenant_id, name, slug, occupancy)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Outsider type', 'outsider-type', 2)$$,
  '42501', null, 'outsider: cannot create room types');
select tests.as_owner();

-- ---------------------------------------------------------------------------------------------
-- Hostel admin of A
-- ---------------------------------------------------------------------------------------------
select tests.as_user('00000000-0000-4000-8000-0000000000a1', 'aal2');
select is((select count(*)::int from public.rooms where tenant_id <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0,
  'admin A: no rooms of other hostels');
select is((select count(*)::int from public.beds), 3, 'admin A: all A beds, including retired');
select is((select count(*)::int from public.room_types where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 2,
  'admin A: published and unpublished A room types');
select is((select count(*)::int from public.booking_periods where status = 'draft' and tenant_id <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0,
  'admin A: no draft periods of other hostels');
select is((select count(*)::int from public.room_type_prices where room_type_id = '20000000-0000-4000-8000-0000000000b2'), 0,
  'admin A: no prices of another hostel''s unpublished room type');
select lives_ok($$insert into public.rooms (tenant_id, room_type_id, label)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-0000000000a2', 'A-102')$$,
  'admin A: can add a room');
select lives_ok($$insert into public.room_type_prices (tenant_id, room_type_id, booking_period_id, amount_minor)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-0000000000a2', '10000000-0000-4000-8000-0000000000a2', 60000)$$,
  'admin A: can set a price');
select throws_ok($$insert into public.rooms (tenant_id, room_type_id, label)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '20000000-0000-4000-8000-0000000000b1', 'B-2')$$,
  '42501', null, 'admin A: cannot add a room to hostel B');
select throws_ok($$update public.rooms set tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  where id = '30000000-0000-4000-8000-0000000000a1'$$, '42501', null, 'admin A: tenant_id cannot be changed');
with u as (update public.rooms set notes = 'hijacked' where id = '30000000-0000-4000-8000-0000000000b1' returning 1)
select is((select count(*)::int from u), 0, 'admin A: updating a B room changes nothing');
with d as (delete from public.room_type_prices where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' returning 1)
select is((select count(*)::int from d), 0, 'admin A: deleting B prices changes nothing');
select throws_ok($$delete from public.bed_blocks where id = '50000000-0000-4000-8000-0000000000a1'$$,
  '42501', null, 'admin A: bed blocks are released, never deleted');
select tests.as_owner();

-- ---------------------------------------------------------------------------------------------
-- Staff of A
-- ---------------------------------------------------------------------------------------------
select tests.as_user('00000000-0000-4000-8000-0000000000a2');
select is((select count(*)::int from public.rooms), 2, 'front desk (inventory.read): sees A rooms');
select throws_ok($$insert into public.rooms (tenant_id, room_type_id, label)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-0000000000a2', 'A-103')$$,
  '42501', null, 'front desk: cannot add rooms without inventory.manage');
with u as (update public.beds set status = 'maintenance' where id = '40000000-0000-4000-8000-0000000000a1' returning 1)
select is((select count(*)::int from u), 0, 'front desk: cannot change beds');
select tests.as_owner();

select tests.as_user('00000000-0000-4000-8000-0000000000a3');
select is((select count(*)::int from public.rooms), 0, 'accounts (no inventory.read): no rooms');
select is((select count(*)::int from public.room_types where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 2,
  'accounts: every member can read the hostel''s room types');
with u as (update public.room_type_prices set amount_minor = 1 where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' returning 1)
select is((select count(*)::int from u), 0, 'accounts: cannot change prices');
select tests.as_owner();

select tests.as_user('00000000-0000-4000-8000-0000000000a4');
select lives_ok($$insert into public.booking_periods (tenant_id, name, kind, starts_on, ends_on)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Short stay Dec', 'short_stay', '2026-12-15', '2027-01-05')$$,
  'manager (inventory.manage): can add a period');
select throws_ok($$insert into public.room_type_prices (tenant_id, room_type_id, booking_period_id, amount_minor)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a2', 1000)$$,
  '42501', null, 'manager (no pricing.manage): cannot set prices');
select tests.as_owner();

-- ---------------------------------------------------------------------------------------------
-- Suspended hostel: staff lose access; public content disappears
-- ---------------------------------------------------------------------------------------------
select tests.as_user('00000000-0000-4000-8000-0000000000c1', 'aal2');
select is((select count(*)::int from public.room_types where tenant_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'), 0,
  'suspended admin: no room types');
select throws_ok($$insert into public.room_types (tenant_id, name, slug, occupancy)
  values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'New type', 'new-type', 2)$$,
  '42501', null, 'suspended admin: cannot write');
select tests.as_owner();

-- ---------------------------------------------------------------------------------------------
-- Platform admin: break-glass gives read-only access; no MFA gives nothing
-- ---------------------------------------------------------------------------------------------
select tests.as_user('00000000-0000-4000-8000-0000000000e1', 'aal2');
select is((select count(*)::int from public.rooms), 1, 'platform admin with break-glass on B: reads B rooms');
select throws_ok($$insert into public.rooms (tenant_id, room_type_id, label)
  values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '20000000-0000-4000-8000-0000000000b1', 'B-3')$$,
  '42501', null, 'platform admin: break-glass is read-only');
select tests.as_owner();

select tests.as_user('00000000-0000-4000-8000-0000000000e1', 'aal1');
select is((select count(*)::int from public.rooms), 0, 'platform admin without MFA: no rooms');
select tests.as_owner();

select * from finish();
rollback;
