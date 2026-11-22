-- Phase 2, task 9. All-or-nothing import of rooms and beds (Phase 2 criteria 2 and 6).
begin;
select plan(35);

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

-- First error of an import, as "field: message", for hostel A.
create function tests.first_error(p_rows jsonb) returns text
language sql as $$
  select r -> 'errors' -> 0 ->> 'field'
  from public.import_inventory('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', p_rows, true) r
$$;

create function tests.counts() returns text
language sql security definer as $$
  select (select count(*) from public.rooms where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') || ' rooms, ' ||
         (select count(*) from public.beds where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') || ' beds'
$$;

grant execute on all functions in schema tests to anon, authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin@a.test'),
  ('00000000-0000-4000-8000-0000000000a2', 'frontdesk@a.test'),
  ('00000000-0000-4000-8000-0000000000a4', 'manager@a.test'),
  ('00000000-0000-4000-8000-0000000000b1', 'admin@b.test'),
  ('00000000-0000-4000-8000-0000000000c1', 'admin@s.test'),
  ('00000000-0000-4000-8000-0000000000e1', 'platform@adestay.test');

insert into public.tenants (id, slug, name, reference_prefix, status, suspended_at, suspension_reason) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'hostel-a', 'Hostel A', 'HA', 'active', null, null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'hostel-b', 'Hostel B', 'HB', 'active', null, null),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'hostel-s', 'Hostel S', 'HS', 'suspended', now(), 'Unpaid subscription');

insert into public.tenant_memberships (tenant_id, user_id, role, permission_set_id, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a1', 'hostel_admin', null, 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a2', 'staff',
     (select id from public.permission_sets where key = 'front_desk' and is_system), 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a4', 'staff',
     (select id from public.permission_sets where key = 'manager' and is_system), 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-4000-8000-0000000000b1', 'hostel_admin', null, 'active'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '00000000-0000-4000-8000-0000000000c1', 'hostel_admin', null, 'active');

insert into public.platform_admins (user_id) values ('00000000-0000-4000-8000-0000000000e1');
insert into public.platform_access_grants (platform_admin_user_id, tenant_id, reason, granted_at, expires_at) values
  ('00000000-0000-4000-8000-0000000000e1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Checking an import question',
   now() - interval '5 minutes', now() + interval '1 hour');

insert into public.room_types (id, tenant_id, name, slug, occupancy) values
  ('20000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Single', 'single', 1),
  ('20000000-0000-4000-8000-0000000000a2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2 in a room', 'two', 2),
  ('20000000-0000-4000-8000-0000000000a4', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '4 in a room', 'four', 4),
  ('20000000-0000-4000-8000-0000000000a5', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Twin name', 'twin-a', 2),
  ('20000000-0000-4000-8000-0000000000a6', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Twin name', 'twin-b', 2),
  ('20000000-0000-4000-8000-0000000000b1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'B Only', 'b-only', 2);
insert into public.rooms (tenant_id, room_type_id, label) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-0000000000a2', 'EXIST-1');

-- ---------------------------------------------------------------------------------------------
-- Validation (dry run)
-- ---------------------------------------------------------------------------------------------
select tests.as_user('00000000-0000-4000-8000-0000000000a1', 'aal2');

select is((public.import_inventory('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '[{"line":2,"room_type":"four","room":"F-1","block":"F","floor":"1","beds":["A","B","C","D"]},
    {"line":3,"room_type":"2 IN A ROOM","room":"T-1","block":"","floor":"","beds":["Left","Right"]}]'::jsonb, true)) ->> 'ok',
  'true', 'a valid file passes the preview');
select is((public.import_inventory('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '[{"line":2,"room_type":"four","room":"F-1","beds":["A","B","C","D"]},
    {"line":3,"room_type":"two","room":"T-1","beds":["A","B"]}]'::jsonb, true)) -> 'by_type',
  '[{"beds":2,"rooms":1,"room_type":"2 in a room"},{"beds":4,"rooms":1,"room_type":"4 in a room"}]'::jsonb,
  'the preview summarises rooms and beds per room type');
select is(tests.counts(), '1 rooms, 0 beds', 'a preview writes nothing');

select is(tests.first_error('[{"line":2,"room_type":"nope","room":"X-1","beds":["A"]}]'), 'room_type', 'unknown room type');
select is(tests.first_error('[{"line":2,"room_type":"b-only","room":"X-1","beds":["A"]}]'), 'room_type', 'another hostel''s room type is unknown here');
select is(tests.first_error('[{"line":2,"room_type":"Twin name","room":"X-1","beds":["A"]}]'), 'room_type', 'an ambiguous room type name is refused');
select is((public.import_inventory('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '[{"line":2,"room_type":"twin-b","room":"X-1","beds":["A"]}]'::jsonb, true)) ->> 'ok', 'true', 'the slug resolves an ambiguous name');
select is(tests.first_error('[{"line":2,"room_type":"two","room":"exist-1","beds":["A"]}]'), 'room', 'an existing room is refused (imports only add)');
select is(tests.first_error('[{"line":2,"room_type":"two","room":"D-1","beds":["A"]},{"line":3,"room_type":"two","room":"d-1","beds":["A"]}]'),
  'room', 'a room repeated in the file is refused');
select is(tests.first_error('[{"line":2,"room_type":"two","room":"=HYPERLINK(1)","beds":["A"]}]'), 'room', 'a spreadsheet formula as a room is refused');
select is(tests.first_error('[{"line":2,"room_type":"two","room":"R-1","block":"@cmd","beds":["A"]}]'), 'block', 'a formula as a block is refused');
select is(tests.first_error('[{"line":2,"room_type":"two","room":"R-1","floor":"+1","beds":["A"]}]'), 'floor', 'a formula as a floor is refused');
select is(tests.first_error('[{"line":2,"room_type":"two","room":"R-1","beds":["A","B","C"]}]'), 'beds', 'more beds than the room type allows');
select is(tests.first_error('[{"line":2,"room_type":"two","room":"R-1","beds":["A","a"]}]'), 'beds', 'duplicate bed labels');
select is(tests.first_error('[{"line":2,"room_type":"two","room":"R-1","beds":[]}]'), 'beds', 'a room needs a bed');
select is(tests.first_error('[{"line":2,"room_type":"two","room":"R-1","beds":[1]}]'), 'beds', 'bed labels must be text');
select is(tests.first_error('[{"line":2,"room_type":"two","room":"R-1","beds":"A"}]'), 'beds', 'beds must be a list');
select is((public.import_inventory('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '[{"line":7,"room_type":"nope","room":"X-1","beds":["A"]}]'::jsonb, true)) -> 'errors' -> 0 ->> 'line', '7', 'errors name the file line');
select throws_ok($$select public.import_inventory('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '[]'::jsonb, true)$$,
  '22023', null, 'an empty import is refused');
select throws_ok($$select public.import_inventory('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  (select jsonb_agg(jsonb_build_object('room_type', 'single', 'room', 'S-' || g, 'beds', array['A'])) from generate_series(1, 501) g), true)$$,
  '22023', null, 'more than 500 rows is refused');

-- ---------------------------------------------------------------------------------------------
-- Import: all or nothing; a 50-bed hostel (criterion 2)
-- ---------------------------------------------------------------------------------------------
select is((public.import_inventory('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '[{"line":2,"room_type":"two","room":"GOOD-1","beds":["A","B"]},
    {"line":3,"room_type":"nope","room":"BAD-1","beds":["A"]}]'::jsonb, false)) ->> 'ok', 'false', 'one bad row fails the import');
select is(tests.counts(), '1 rooms, 0 beds', 'and nothing from the file was written');

select is((select (r ->> 'rooms') || '/' || (r ->> 'beds') from public.import_inventory('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  (select jsonb_agg(x) from (
     select jsonb_build_object('room_type', 'single', 'room', 'S-' || g, 'beds', array['A']) as x from generate_series(1, 2) g
     union all select jsonb_build_object('room_type', 'two', 'room', 'T-' || g, 'beds', array['A', 'B']) from generate_series(1, 10) g
     union all select jsonb_build_object('room_type', 'four', 'room', 'F-' || g, 'beds', array['A', 'B', 'C', 'D']) from generate_series(1, 7) g
  ) s), false) r), '19/50', 'imports 19 rooms with 50 beds');
select is(tests.counts(), '20 rooms, 50 beds', 'the rooms and beds exist');
select is((select sum(sellable_beds)::int from public.room_type_capacity('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')), null::int,
  'no period yet, so no capacity rows');
select ok(exists (select 1 from public.audit_logs where action = 'inventory.imported' and after ->> 'beds' = '50'),
  'the import is summarised in the audit log');
select is((public.import_inventory('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '[{"line":2,"room_type":"single","room":"S-1","beds":["A"]}]'::jsonb, false)) ->> 'ok', 'false', 'importing the same file twice adds nothing');
select is(tests.counts(), '20 rooms, 50 beds', 'counts are unchanged after the repeat');
select tests.as_owner();

-- ---------------------------------------------------------------------------------------------
-- Who may import
-- ---------------------------------------------------------------------------------------------
select tests.as_user('00000000-0000-4000-8000-0000000000a4');
select is((public.import_inventory('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '[{"room_type":"two","room":"M-1","beds":["A"]}]'::jsonb, true)) ->> 'ok', 'true', 'manager (inventory.manage): can import');
select tests.as_owner();

select tests.as_user('00000000-0000-4000-8000-0000000000a2');
select throws_ok($$select public.import_inventory('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '[{"room_type":"two","room":"Z-1","beds":["A"]}]'::jsonb, true)$$,
  '42501', null, 'front desk (inventory.read): refused, even for a preview');
select tests.as_owner();

select tests.as_user('00000000-0000-4000-8000-0000000000b1', 'aal2');
select throws_ok($$select public.import_inventory('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '[{"room_type":"two","room":"Z-1","beds":["A"]}]'::jsonb, false)$$,
  '42501', null, 'admin of hostel B: refused on hostel A');
select tests.as_owner();

select tests.as_user('00000000-0000-4000-8000-0000000000c1', 'aal2');
select throws_ok($$select public.import_inventory('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '[{"room_type":"two","room":"Z-1","beds":["A"]}]'::jsonb, false)$$,
  '42501', null, 'admin of a suspended hostel: refused');
select tests.as_owner();

select tests.as_user('00000000-0000-4000-8000-0000000000e1', 'aal2');
select throws_ok($$select public.import_inventory('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '[{"room_type":"two","room":"Z-1","beds":["A"]}]'::jsonb, false)$$,
  '42501', null, 'platform admin with break-glass: refused (read-only)');
select tests.as_owner();

select tests.as_user('00000000-0000-4000-8000-0000000000a1', 'aal1');
select throws_ok($$select public.import_inventory('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '[{"room_type":"two","room":"Z-1","beds":["A"]}]'::jsonb, false)$$,
  '42501', null, 'hostel admin without MFA: refused');
select tests.as_owner();

select tests.as_anon();
select throws_ok($$select public.import_inventory('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '[{"room_type":"two","room":"Z-1","beds":["A"]}]'::jsonb, false)$$,
  '42501', null, 'anon: refused');
select tests.as_owner();

select * from finish();
rollback;
