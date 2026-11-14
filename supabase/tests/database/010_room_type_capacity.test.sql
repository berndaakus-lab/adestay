-- Phase 2, task 2. Sellable capacity per room type × period (Phase 2 acceptance criterion 2:
-- "a hostel admin can model 50 beds and see correct sellable-capacity counts").
begin;
select plan(24);

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

-- Capacity rows for one room type, as "total/out_of_service/blocked/sellable".
create function tests.cap(p_tenant uuid, p_type_slug text, p_period_name text) returns text
language sql as $$
  select c.total_beds || '/' || c.out_of_service_beds || '/' || c.blocked_beds || '/' || c.sellable_beds
  from public.room_type_capacity(p_tenant) c
  join public.room_types rt on rt.id = c.room_type_id
  join public.booking_periods bp on bp.id = c.booking_period_id
  where rt.slug = p_type_slug and bp.name = p_period_name
$$;

grant execute on all functions in schema tests to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin@a.test'),
  ('00000000-0000-4000-8000-0000000000a2', 'frontdesk@a.test'),
  ('00000000-0000-4000-8000-0000000000a3', 'accounts@a.test'),
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
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-4000-8000-0000000000b1', 'hostel_admin', null, 'active'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '00000000-0000-4000-8000-0000000000c1', 'hostel_admin', null, 'active');

insert into public.platform_admins (user_id) values ('00000000-0000-4000-8000-0000000000e1');
insert into public.platform_access_grants (platform_admin_user_id, tenant_id, reason, granted_at, expires_at) values
  ('00000000-0000-4000-8000-0000000000e1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Checking capacity figures for B',
   now() - interval '5 minutes', now() + interval '1 hour');

-- Hostel A: three periods (one archived) and four room types.
insert into public.booking_periods (tenant_id, name, kind, starts_on, ends_on, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Year', 'academic_year', '2026-09-01', '2027-07-31', 'open'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Vacation', 'vacation', '2027-08-01', '2027-08-31', 'draft'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Old year', 'academic_year', '2025-09-01', '2026-07-31', 'archived'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'B Year', 'academic_year', '2026-09-01', '2027-07-31', 'open'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'S Year', 'academic_year', '2026-09-01', '2027-07-31', 'open');

insert into public.room_types (tenant_id, name, slug, occupancy, is_published) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Single', 'single', 1, true),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2 in a room', 'two', 2, true),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '4 in a room', 'four', 4, true),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Suite (no rooms yet)', 'suite', 2, false),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'B Triple', 'triple', 3, true),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'S Single', 'single', 1, true);

-- 2 singles + 10 doubles + 7 quads = 2 + 20 + 28 = 50 beds in hostel A; B has one triple.
insert into public.rooms (tenant_id, room_type_id, label)
select rt.tenant_id, rt.id, upper(rt.slug::text) || '-' || g
from public.room_types rt
cross join lateral generate_series(1, case rt.slug::text when 'single' then 2 when 'two' then 10 when 'four' then 7 when 'triple' then 1 else 0 end) g
where rt.slug::text <> 'suite';

insert into public.beds (tenant_id, room_id, label)
select r.tenant_id, r.id, chr(64 + g)
from public.rooms r
join public.room_types rt on rt.tenant_id = r.tenant_id and rt.id = r.room_type_id
cross join lateral generate_series(1, rt.occupancy) g;

-- Changes to hostel A's 50 beds:
--   doubles: TWO-1 bed B retired; TWO-2 bed A in maintenance; TWO-3 bed A blocked 1-15 Oct 2026
--            (inside the year); TWO-4 bed A had a vacation block that was released.
--   quads:   FOUR-1 room in maintenance (4 beds out of service); FOUR-2 room retired (4 beds gone).
--   singles: SINGLE-1 blocked 31 Jul - 1 Aug 2027: the last day of the year and the first of the vacation.
update public.beds set status = 'retired'
  where label = 'B' and room_id = (select id from public.rooms where label = 'TWO-1');
update public.beds set status = 'maintenance'
  where label = 'A' and room_id = (select id from public.rooms where label = 'TWO-2');
update public.rooms set status = 'maintenance' where label = 'FOUR-1';
update public.rooms set status = 'retired' where label = 'FOUR-2';

insert into public.bed_blocks (tenant_id, bed_id, blocked, reason)
select b.tenant_id, b.id, x.blocked, x.reason
from (values
  ('TWO-3', daterange('2026-10-01', '2026-10-16'), 'Ceiling leak'),
  ('TWO-4', daterange('2027-08-01', '2027-08-10'), 'Vacation repaint'),
  ('SINGLE-1', daterange('2027-07-31', '2027-08-02'), 'Mattress replacement')
) as x(room_label, blocked, reason)
join public.rooms r on r.label = x.room_label
join public.beds b on b.room_id = r.id and b.label = 'A';
update public.bed_blocks set released_at = now() where reason = 'Vacation repaint';

-- ---------------------------------------------------------------------------------------------
-- Correct counts (hostel admin of A)
-- ---------------------------------------------------------------------------------------------
select tests.as_user('00000000-0000-4000-8000-0000000000a1', 'aal2');
select is((select count(*)::int from public.beds), 50, 'hostel A models 50 beds');
select is((select count(*)::int from public.room_type_capacity('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')), 8,
  'one row per room type × non-archived period (4 × 2)');
select is(tests.cap('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'two', 'Year'), '19/1/1/17',
  'doubles, year: retired bed gone, maintenance bed out, blocked bed not sellable');
select is(tests.cap('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'two', 'Vacation'), '19/1/0/18',
  'doubles, vacation: October block and released block do not count');
select is(tests.cap('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'four', 'Year'), '24/4/0/20',
  'quads: retired room excluded, room in maintenance out of service');
select is(tests.cap('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'single', 'Year'), '2/0/1/1',
  'singles, year: a block on the last day of the period counts');
select is(tests.cap('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'single', 'Vacation'), '2/0/1/1',
  'singles, vacation: the same block on the first day counts too');
select is(tests.cap('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'suite', 'Year'), '0/0/0/0',
  'a room type with no rooms has zero capacity (not missing)');
select is((select sum(sellable_beds)::int from public.room_type_capacity('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
           c join public.booking_periods bp on bp.id = c.booking_period_id where bp.name = 'Year'), 38,
  'sellable beds for the year across all types: 17 + 20 + 1');
select is((select count(*)::int from public.room_type_capacity('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
           (select id from public.booking_periods where name = 'Vacation'))), 4,
  'filtering by period returns that period only');
select is((select count(*)::int from public.room_type_capacity('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
           c join public.booking_periods bp on bp.id = c.booking_period_id where bp.status = 'archived'), 0,
  'archived periods are left out');

-- A block added later reduces capacity at once; releasing it restores it.
insert into public.bed_blocks (tenant_id, bed_id, blocked, reason)
select b.tenant_id, b.id, daterange('2027-03-01', '2027-03-05'), 'Pest control'
from public.beds b join public.rooms r on r.id = b.room_id where r.label = 'FOUR-3' and b.label = 'A';
select is(tests.cap('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'four', 'Year'), '24/4/1/19', 'a new block reduces sellable beds');
update public.bed_blocks set released_at = now() where reason = 'Pest control';
select is(tests.cap('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'four', 'Year'), '24/4/0/20', 'releasing it restores them');
select is((select count(*)::int from public.room_type_capacity('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')), 0,
  'admin A: nothing for hostel B');
select tests.as_owner();

-- ---------------------------------------------------------------------------------------------
-- Who may see capacity
-- ---------------------------------------------------------------------------------------------
select tests.as_user('00000000-0000-4000-8000-0000000000a2');
select is((select count(*)::int from public.room_type_capacity('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')), 8,
  'front desk (inventory.read): sees capacity');
select tests.as_owner();

select tests.as_user('00000000-0000-4000-8000-0000000000a3');
select is((select count(*)::int from public.room_type_capacity('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')), 0,
  'accounts (no inventory permission): no rows');
select tests.as_owner();

select tests.as_user('00000000-0000-4000-8000-0000000000f1');
select is((select count(*)::int from public.room_type_capacity('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')), 0,
  'outsider: no rows');
select throws_ok($$select * from app.room_type_capacity('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$, '42501', null,
  'signed-in users cannot call the unchecked internal function');
select tests.as_owner();

select tests.as_user('00000000-0000-4000-8000-0000000000c1', 'aal2');
select is((select count(*)::int from public.room_type_capacity('cccccccc-cccc-4ccc-8ccc-cccccccccccc')), 0,
  'admin of a suspended hostel: no rows');
select tests.as_owner();

select tests.as_user('00000000-0000-4000-8000-0000000000e1', 'aal2');
select is(tests.cap('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'triple', 'B Year'), '3/0/0/3',
  'platform admin with break-glass on B: reads B capacity');
select is((select count(*)::int from public.room_type_capacity('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')), 0,
  'platform admin: nothing without a grant for A');
select tests.as_owner();

select tests.as_anon();
select throws_ok($$select * from public.room_type_capacity('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$, '42501', null,
  'anon: cannot call the capacity function (exact counts are not public, D-4)');
select tests.as_owner();

select ok(not has_function_privilege('authenticated', 'app.room_type_capacity(uuid, uuid)', 'execute'),
  'app.room_type_capacity has no API grant');
select ok(not has_function_privilege('anon', 'public.room_type_capacity(uuid, uuid)', 'execute'),
  'public.room_type_capacity is not granted to anon');

select * from finish();
rollback;
