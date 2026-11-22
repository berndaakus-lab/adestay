-- Phase 3, task 6. Hold and request expiry with a controlled clock (Phase 3 acceptance criterion 4,
-- database part). Parallel runs and SKIP LOCKED need real Postgres (task 8).
begin;
select plan(33);

create schema tests;
grant usage on schema tests to anon, authenticated, service_role;

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

grant execute on all functions in schema tests to anon, authenticated, service_role;

-- Booking n in the given period (1 year, 2 window closed, 3 window open, 4 no window; 9 hostel S).
create function tests.booking(p_n integer, p_status text, p_period integer, p_reservation text default null,
                              p_expires timestamptz default null, p_room integer default 1)
returns void
language plpgsql as $$
declare
  v_tenant uuid := case when p_period = 9 then 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid else 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid end;
  v_suffix text := lpad(p_n::text, 2, '0');
  v_request uuid := ('70000000-0000-4000-8000-0000000000' || v_suffix)::uuid;
  v_resident uuid := ('60000000-0000-4000-8000-0000000000' || v_suffix)::uuid;
  v_period uuid := ('10000000-0000-4000-8000-00000000000' || p_period)::uuid;
  v_room uuid := case when p_period = 9 then '20000000-0000-4000-8000-000000000009'::uuid
                      else ('20000000-0000-4000-8000-00000000000' || p_room)::uuid end;
begin
  insert into public.residents (id, tenant_id, full_name, email)
  values (v_resident, v_tenant, 'Student ' || p_n, 'student' || p_n || '@example.com');
  insert into public.booking_requests (id, tenant_id, reference, resident_id, booking_period_id, room_type_id, status,
                                       quoted_amount_minor, decided_at, idempotency_key)
  values (v_request, v_tenant, 'HA-AAAA' || v_suffix, v_resident, v_period, v_room, p_status, 1000,
          case when p_status = 'approved' then now() end, gen_random_uuid());
  if p_reservation is not null then
    insert into public.reservations (id, tenant_id, booking_request_id, room_type_id, booking_period_id, status, hold_expires_at, confirmed_at)
    values (('90000000-0000-4000-8000-0000000000' || v_suffix)::uuid, v_tenant, v_request, v_room, v_period, p_reservation, p_expires,
            case when p_reservation = 'confirmed' then now() end);
  end if;
end $$;

create function tests.request_status(p_n integer) returns text
language sql as $$
  select status from public.booking_requests where id = ('70000000-0000-4000-8000-0000000000' || lpad(p_n::text, 2, '0'))::uuid
$$;

create function tests.reservation_status(p_n integer) returns text
language sql as $$
  select status from public.reservations where id = ('90000000-0000-4000-8000-0000000000' || lpad(p_n::text, 2, '0'))::uuid
$$;

-- ---------------------------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------------------------
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000a1', 'admin@a.test');

insert into public.tenants (id, slug, name, reference_prefix, status, suspended_at, suspension_reason) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'hostel-a', 'Hostel A', 'HA', 'active', null, null),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'hostel-s', 'Hostel S', 'HS', 'suspended', now(), 'Unpaid subscription');

insert into public.tenant_memberships (tenant_id, user_id, role, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a1', 'hostel_admin', 'active');

insert into public.booking_periods (id, tenant_id, name, kind, starts_on, ends_on, status, booking_opens_at, booking_closes_at) values
  ('10000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Year', 'academic_year', '2027-09-01', '2028-07-31', 'open', null, null),
  ('10000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Window closed', 'semester', '2029-01-01', '2029-05-31', 'open', now() - interval '9 days', now() - interval '1 hour'),
  ('10000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Window open', 'semester', '2030-01-01', '2030-05-31', 'open', now() - interval '9 days', now() + interval '60 days'),
  ('10000000-0000-4000-8000-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'No window', 'semester', '2031-01-01', '2031-05-31', 'open', null, null),
  ('10000000-0000-4000-8000-000000000009', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'S closed', 'semester', '2029-01-01', '2029-05-31', 'open', now() - interval '9 days', now() - interval '1 hour');

insert into public.room_types (id, tenant_id, name, slug, occupancy, is_published) values
  ('20000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Big', 'big', 12, true),
  ('20000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Clock', 'clock', 1, true),
  ('20000000-0000-4000-8000-000000000009', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'S One', 'one', 1, true);

insert into public.rooms (id, tenant_id, room_type_id, label) values
  ('30000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-000000000002', 'C-1');
insert into public.beds (tenant_id, room_id, label) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '30000000-0000-4000-8000-000000000002', 'A');

select tests.booking(1, 'approved', 1, 'held', now() - interval '1 hour');
select tests.booking(2, 'approved', 1, 'held', now() + interval '30 days');
select tests.booking(3, 'approved', 1, 'confirmed');
select tests.booking(5, 'approved', 9, 'held', now() - interval '1 hour');
select tests.booking(6, 'submitted', 2);
select tests.booking(7, 'waitlisted', 2);
select tests.booking(8, 'under_review', 2);
select tests.booking(9, 'approved', 2, 'held', now() + interval '30 days');
select tests.booking(10, 'submitted', 3);
select tests.booking(11, 'submitted', 4);

-- Second request in hostel S, in its closed window.
insert into public.residents (id, tenant_id, full_name, email) values
  ('60000000-0000-4000-8000-000000000012', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Student 12', 'student12@example.com');
insert into public.booking_requests (id, tenant_id, reference, resident_id, booking_period_id, room_type_id, quoted_amount_minor, idempotency_key) values
  ('70000000-0000-4000-8000-000000000012', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'HS-AAAA12', '60000000-0000-4000-8000-000000000012',
   '10000000-0000-4000-8000-000000000009', '20000000-0000-4000-8000-000000000009', 1000, gen_random_uuid());

-- ---------------------------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.expire_reservations(integer)', 'execute'), 'visitors cannot run expiry');
select ok(not has_function_privilege('authenticated', 'public.expire_reservations(integer)', 'execute'), 'signed-in users cannot run expiry');
select ok(has_function_privilege('service_role', 'public.expire_reservations(integer)', 'execute'), 'the server job can run expiry');
select ok(not has_function_privilege('authenticated', 'app.expire_reservations(timestamptz, integer)', 'execute'), 'nobody can pass their own clock');
select tests.as_user('00000000-0000-4000-8000-0000000000a1', 'aal2');
select throws_ok($$select * from public.expire_reservations()$$, '42501', null, 'even a hostel admin cannot run expiry');
select tests.as_owner();

-- ---------------------------------------------------------------------------------------------
-- One run
-- ---------------------------------------------------------------------------------------------
create temp table run1 as select * from public.expire_reservations();

select is((select expired_reservations from run1), 1, 'one overdue hold expired');
select is((select lapsed_request_ids from run1), array['70000000-0000-4000-8000-000000000001'::uuid], 'its request id is returned for the email');
select is(tests.reservation_status(1), 'expired', 'the reservation is expired');
select ok((select ended_at is not null and end_reason = 'Hold expired' from public.reservations where id = '90000000-0000-4000-8000-000000000001'), 'the end time and reason are stored');
select is(tests.request_status(1), 'lapsed', 'the request has lapsed');
select is(tests.reservation_status(2), 'held', 'a hold with time left is untouched');
select is(tests.reservation_status(3), 'confirmed', 'a confirmed reservation never expires');
select is(tests.reservation_status(5), 'held', 'a suspended hostel''s hold is left alone');
select is(tests.request_status(6), 'submitted', 'an unreviewed request stays with staff after the window closes');
select is(tests.request_status(7), 'waitlisted', 'a waitlisted request stays with staff after the window closes');
select is(tests.request_status(8), 'under_review', 'a request under review stays with staff');
select is(tests.request_status(9), 'approved', 'an approved request is not closed by the window');
select is(tests.request_status(10), 'submitted', 'a window still open closes nothing');
select is(tests.request_status(11), 'submitted', 'a period with no closing time closes nothing');
select is(tests.request_status(12), 'submitted', 'a suspended hostel''s request is left alone');

select is((select actor_type from public.audit_logs where action = 'reservation.expired' and entity_id = '90000000-0000-4000-8000-000000000001'), 'cron', 'hold expiry is audited as the job');
select is((select count(*)::int from public.audit_logs where action = 'booking.expired'), 0, 'the job closes no requests');

set local role service_role;
select is((select expired_reservations from public.expire_reservations()), 0, 'running again changes nothing');
reset role;

-- ---------------------------------------------------------------------------------------------
-- Criterion 4: a hold ends exactly at its expiry and releases capacity
-- ---------------------------------------------------------------------------------------------
select tests.booking(20, 'approved', 1, 'held', now() + interval '2 hours', 2);
select is((select remaining_beds from app.room_type_availability('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '10000000-0000-4000-8000-000000000001')
           where room_type_id = '20000000-0000-4000-8000-000000000002'), 0, 'the hold uses the only bed');
select is((select expired_reservations from app.expire_reservations(now() + interval '2 hours' - interval '1 second')), 0, 'one second before expiry nothing happens');
select is(tests.reservation_status(20), 'held', 'the hold is still live');
select is((select expired_reservations from app.expire_reservations(now() + interval '2 hours')), 1, 'at the expiry time the hold ends');
select is((select remaining_beds from app.room_type_availability('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '10000000-0000-4000-8000-000000000001')
           where room_type_id = '20000000-0000-4000-8000-000000000002'), 1, 'the bed is available again');

-- ---------------------------------------------------------------------------------------------
-- Batches
-- ---------------------------------------------------------------------------------------------
select tests.booking(21, 'approved', 1, 'held', now() - interval '3 hours');
select tests.booking(22, 'approved', 1, 'held', now() - interval '2 hours');
create temp table batch1 as select * from public.expire_reservations(1);
select is((select expired_reservations from batch1), 1, 'a batch respects its limit');
select ok((select has_more from batch1), 'and says more may be waiting');
select is(tests.reservation_status(21), 'expired', 'the oldest hold goes first');
select is((select expired_reservations from public.expire_reservations(10)), 1, 'the next run takes the rest');
select throws_ok($$select * from public.expire_reservations(0)$$, '22023', null, 'an invalid batch size is refused');

select * from finish();
rollback;
