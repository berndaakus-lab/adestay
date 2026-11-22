-- Phase 3, task 3. Availability counts live reservations by the busiest day, and the public
-- indicator never reveals exact counts (docs/BOOKING_AND_PAYMENT_FLOWS.md §3, D-4).
begin;
select plan(32);

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

-- "sellable/reserved/remaining" from the internal function.
create function tests.avail(p_room uuid, p_period uuid) returns text
language sql as $$
  select a.sellable_beds || '/' || a.reserved_beds || '/' || a.remaining_beds
  from app.room_type_availability('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', p_period) a
  where a.room_type_id = p_room
$$;

create function tests.ind(p_tenant uuid, p_room uuid, p_period uuid) returns text
language sql as $$
  select i.availability from public.room_type_availability_indicators(p_tenant, p_period) i
  where i.room_type_id = p_room
$$;

-- A reservation for a new student, in the given state.
create function tests.reserve(p_room uuid, p_period uuid, p_status text, p_expires timestamptz default now() + interval '1 day')
returns void
language plpgsql as $$
declare
  v_tenant uuid;
  v_resident uuid := gen_random_uuid();
  v_request uuid := gen_random_uuid();
begin
  select tenant_id into v_tenant from public.room_types where id = p_room;
  insert into public.residents (id, tenant_id, full_name, email)
  values (v_resident, v_tenant, 'Test Student', v_resident::text || '@example.com');
  insert into public.booking_requests (id, tenant_id, reference, resident_id, booking_period_id, room_type_id, status,
                                       quoted_amount_minor, decided_at, idempotency_key)
  values (v_request, v_tenant, app.generate_booking_reference('HA'), v_resident, p_period, p_room, 'approved', 1000, now(), gen_random_uuid());
  insert into public.reservations (tenant_id, booking_request_id, room_type_id, booking_period_id, status,
                                   hold_expires_at, confirmed_at, ended_at)
  values (v_tenant, v_request, p_room, p_period, p_status,
          case when p_status = 'held' then p_expires end,
          case when p_status in ('confirmed', 'fulfilled') then now() end,
          case when p_status in ('expired', 'cancelled', 'released') then now() end);
end $$;

grant execute on function tests.as_user(uuid, text), tests.as_anon(), tests.as_owner(),
  tests.ind(uuid, uuid, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a2', 'frontdesk@a.test'),
  ('00000000-0000-4000-8000-0000000000b1', 'admin@b.test'),
  ('00000000-0000-4000-8000-0000000000f1', 'student@example.com');

insert into public.tenants (id, slug, name, reference_prefix, status, suspended_at, suspension_reason) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'hostel-a', 'Hostel A', 'HA', 'active', null, null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'hostel-b', 'Hostel B', 'HB', 'active', null, null),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'hostel-s', 'Hostel S', 'HS', 'suspended', now(), 'Unpaid subscription'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'hostel-u', 'Hostel U', 'HU', 'active', null, null);

insert into public.tenant_profiles (tenant_id, display_name, is_published) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Hostel A', true),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Hostel B', true),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Hostel S', true),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'Hostel U', false);

insert into public.tenant_memberships (tenant_id, user_id, role, permission_set_id, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a2', 'staff',
     (select id from public.permission_sets where key = 'front_desk' and is_system), 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-4000-8000-0000000000b1', 'hostel_admin', null, 'active');

insert into public.booking_periods (id, tenant_id, name, kind, starts_on, ends_on, status, booking_opens_at, booking_closes_at) values
  ('10000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Year', 'academic_year', '2027-09-01', '2028-07-31', 'open', null, null),
  ('10000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Semester 1', 'semester', '2027-09-01', '2027-12-20', 'open', null, null),
  ('10000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Semester 2', 'semester', '2028-01-10', '2028-05-31', 'open', null, null),
  ('10000000-0000-4000-8000-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Vacation', 'vacation', '2028-08-01', '2028-08-31', 'open', null, null),
  ('10000000-0000-4000-8000-000000000005', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Indicator', 'short_stay', '2031-01-01', '2031-01-31', 'open', null, null),
  ('10000000-0000-4000-8000-000000000006', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Draft', 'short_stay', '2031-03-01', '2031-03-31', 'draft', null, null),
  ('10000000-0000-4000-8000-000000000007', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Window closed', 'short_stay', '2031-05-01', '2031-05-31', 'open', now() - interval '9 days', now() - interval '1 day'),
  ('10000000-0000-4000-8000-0000000000b1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'B Year', 'academic_year', '2031-01-01', '2031-07-31', 'open', null, null),
  ('10000000-0000-4000-8000-0000000000c1', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'S Year', 'academic_year', '2031-01-01', '2031-07-31', 'open', null, null),
  ('10000000-0000-4000-8000-0000000000e1', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'U Year', 'academic_year', '2031-01-01', '2031-07-31', 'open', null, null);

insert into public.room_types (id, tenant_id, name, slug, occupancy, is_published) values
  ('20000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Five', 'five', 5, true),
  ('20000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'One', 'one', 1, true),
  ('20000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Four', 'four', 4, true),
  ('20000000-0000-4000-8000-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Hidden', 'hidden', 1, false),
  ('20000000-0000-4000-8000-000000000005', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'No price', 'no-price', 1, true),
  ('20000000-0000-4000-8000-0000000000b1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'B One', 'one', 1, true),
  ('20000000-0000-4000-8000-0000000000c1', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'S One', 'one', 1, true),
  ('20000000-0000-4000-8000-0000000000e1', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'U One', 'one', 1, true);

insert into public.rooms (id, tenant_id, room_type_id, label)
select ('30000000-0000-4000-8000-0000000000' || suffix)::uuid, tenant::uuid, room_type::uuid, 'R-' || suffix
from (values
  ('01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-000000000001'),
  ('02', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-000000000002'),
  ('03', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-000000000003'),
  ('04', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-000000000004'),
  ('05', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-000000000005'),
  ('b1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '20000000-0000-4000-8000-0000000000b1'),
  ('c1', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '20000000-0000-4000-8000-0000000000c1'),
  ('e1', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '20000000-0000-4000-8000-0000000000e1')
) v(suffix, tenant, room_type);

insert into public.beds (id, tenant_id, room_id, label)
select ('40000000-0000-4000-8000-00000000' || suffix || lpad(n::text, 2, '0'))::uuid, tenant::uuid,
       ('30000000-0000-4000-8000-0000000000' || suffix)::uuid, 'B' || n
from (values
  ('01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 5),
  ('02', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1),
  ('03', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 4),
  ('04', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1),
  ('05', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1),
  ('b1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 1),
  ('c1', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 1),
  ('e1', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 1)
) v(suffix, tenant, beds), generate_series(1, v.beds) n;

insert into public.room_type_prices (tenant_id, room_type_id, booking_period_id, amount_minor) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000005', 1000),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000006', 1000),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000007', 1000),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000005', 1000),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '20000000-0000-4000-8000-0000000000b1', '10000000-0000-4000-8000-0000000000b1', 1000),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '20000000-0000-4000-8000-0000000000c1', '10000000-0000-4000-8000-0000000000c1', 1000),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '20000000-0000-4000-8000-0000000000e1', '10000000-0000-4000-8000-0000000000e1', 1000);

-- ---------------------------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'app.room_type_availability(uuid, uuid)', 'execute'), 'visitors cannot call the internal function');
select ok(not has_function_privilege('anon', 'public.room_type_availability(uuid, uuid)', 'execute'), 'visitors cannot read exact availability');
select ok(has_function_privilege('anon', 'public.room_type_availability_indicators(uuid, uuid)', 'execute'), 'visitors can read the indicator');
select is((select count(*)::int from pg_proc p, unnest(p.proargnames) arg
           where p.oid = 'public.room_type_availability_indicators(uuid, uuid)'::regprocedure
             and arg in ('sellable_beds', 'reserved_beds', 'remaining_beds')),
  0, 'the public indicator has no count columns');

-- ---------------------------------------------------------------------------------------------
-- Busiest-day counting
-- ---------------------------------------------------------------------------------------------
select is(tests.avail('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'), '5/0/5', 'no bookings: all beds remain');

select tests.reserve('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'held');
select tests.reserve('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'confirmed');
select is(tests.avail('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002'), '5/2/3', 'held and confirmed reservations use capacity');
select is(tests.avail('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'), '5/2/3', 'a semester booking also uses the overlapping academic year');
select is(tests.avail('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003'), '5/0/5', 'semester 2 does not overlap semester 1');

select tests.reserve('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'confirmed') from generate_series(1, 3);
select is(tests.avail('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'), '5/3/2', 'the year counts its busiest day (3), not the sum of both semesters (5)');
select is(tests.avail('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002'), '5/2/3', 'semester 1 is unchanged by semester 2');

select tests.reserve('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'held');
select is(tests.avail('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002'), '5/3/2', 'a full-year booking uses capacity in semester 1');
select is(tests.avail('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003'), '5/4/1', 'and in semester 2');
select is(tests.avail('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004'), '5/0/5', 'a period after the year is free');

select tests.reserve('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', s)
from unnest(array['expired', 'cancelled', 'released']) s;
select is(tests.avail('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002'), '5/3/2', 'ended reservations do not count');

select tests.reserve('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'held', now() - interval '1 minute');
select is(tests.avail('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002'), '5/3/2', 'an overdue hold stops counting before the expiry job runs');

select tests.reserve('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 'fulfilled');
select is(tests.avail('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004'), '5/1/4', 'a fulfilled reservation still uses capacity');
select is(tests.avail('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001'), '1/0/1', 'another room type is unaffected');

insert into public.bed_blocks (tenant_id, bed_id, blocked, reason)
select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ('40000000-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid,
       daterange('2027-10-01', '2027-10-05'), 'Repairs'
from generate_series(1, 3) n;
select is(tests.avail('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002'), '2/3/0', 'blocked beds reduce capacity and remaining never goes below zero');
select ok((select overcommitted from app.room_type_availability('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '10000000-0000-4000-8000-000000000002')
           where room_type_id = '20000000-0000-4000-8000-000000000001'),
  'more live reservations than beds is flagged as overcommitted');

-- ---------------------------------------------------------------------------------------------
-- Public indicator
-- ---------------------------------------------------------------------------------------------
select tests.as_anon();
select is(tests.ind('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000005'), 'available', '4 left shows Available');
select tests.as_owner();
select tests.reserve('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000005', 'held');
select tests.as_anon();
select is(tests.ind('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000005'), 'limited', '3 left shows Limited');
select tests.as_owner();
select tests.reserve('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000005', 'held') from generate_series(1, 3);
select tests.as_anon();
select is(tests.ind('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000005'), 'full', '0 left shows Full');
select is(tests.ind('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000005'), null, 'an unpublished room type is not listed');
select is(tests.ind('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000005'), null, 'a room type with no price is not listed');
select is(tests.ind('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000006'), null, 'a draft period is not listed');
select is(tests.ind('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000007'), null, 'a period whose booking window closed is not listed');
select is((select count(*)::int from public.room_type_availability_indicators('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')), 0, 'an unpublished hostel lists nothing');
select is((select count(*)::int from public.room_type_availability_indicators('cccccccc-cccc-4ccc-8ccc-cccccccccccc')), 0, 'a suspended hostel lists nothing');
select is((select count(*)::int from public.room_type_availability_indicators('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') i
           where i.room_type_id = '20000000-0000-4000-8000-000000000003'), 0, 'one hostel''s indicator never returns another hostel''s rooms');

-- ---------------------------------------------------------------------------------------------
-- Staff figures
-- ---------------------------------------------------------------------------------------------
select tests.as_owner();
select tests.as_user('00000000-0000-4000-8000-0000000000a2');
select ok((select count(*) > 0 from public.room_type_availability('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')), 'hostel staff can read exact availability');

select tests.as_owner();
select tests.as_user('00000000-0000-4000-8000-0000000000b1', 'aal2');
select is((select count(*)::int from public.room_type_availability('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')), 0, 'another hostel''s admin gets nothing');

select tests.as_owner();
select tests.as_user('00000000-0000-4000-8000-0000000000f1');
select is((select count(*)::int from public.room_type_availability('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')), 0, 'a student gets no exact counts');

select tests.as_owner();
select * from finish();
rollback;
