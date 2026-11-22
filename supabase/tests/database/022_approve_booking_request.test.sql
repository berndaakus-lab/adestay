-- Phase 3, task 4. public.approve_booking_request: permission, state, capacity and the hold
-- (docs/adr/0003-booking-concurrency.md). Truly parallel approvals are tested on real Postgres in
-- task 8, because PGlite has a single connection.
begin;
select plan(28);

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

-- ---------------------------------------------------------------------------------------------
-- Fixtures: hostel A has one room type with 2 beds
-- ---------------------------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin@a.test'),
  ('00000000-0000-4000-8000-0000000000a2', 'frontdesk@a.test'),
  ('00000000-0000-4000-8000-0000000000a4', 'manager@a.test'),
  ('00000000-0000-4000-8000-0000000000b1', 'admin@b.test'),
  ('00000000-0000-4000-8000-0000000000c1', 'admin@s.test'),
  ('00000000-0000-4000-8000-0000000000d1', 'student@a.test'),
  ('00000000-0000-4000-8000-0000000000e1', 'platform@adestay.test');

insert into public.tenants (id, slug, name, reference_prefix, status, suspended_at, suspension_reason) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'hostel-a', 'Hostel A', 'HA', 'active', null, null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'hostel-b', 'Hostel B', 'HB', 'active', null, null),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'hostel-s', 'Hostel S', 'HS', 'suspended', now(), 'Unpaid subscription');

insert into public.tenant_settings (tenant_id, hold_duration_hours) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 72),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 120),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 120);

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
  ('00000000-0000-4000-8000-0000000000e1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Checking a booking question',
   now() - interval '5 minutes', now() + interval '1 hour');

insert into public.booking_periods (id, tenant_id, name, kind, starts_on, ends_on, status) values
  ('10000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Year', 'academic_year', '2027-09-01', '2028-07-31', 'open'),
  ('10000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Semester', 'semester', '2027-09-01', '2027-12-20', 'open'),
  ('10000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Vacation', 'vacation', '2028-08-01', '2028-08-31', 'open'),
  ('10000000-0000-4000-8000-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Past', 'semester', '2020-01-01', '2020-05-01', 'closed'),
  ('10000000-0000-4000-8000-0000000000c1', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'S Year', 'academic_year', '2027-09-01', '2028-07-31', 'open');

insert into public.room_types (id, tenant_id, name, slug, occupancy, is_published) values
  ('20000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Two', 'two', 2, true),
  ('20000000-0000-4000-8000-0000000000c1', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'S One', 'one', 1, true);

insert into public.rooms (id, tenant_id, room_type_id, label) values
  ('30000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-000000000001', 'A-1'),
  ('30000000-0000-4000-8000-0000000000c1', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '20000000-0000-4000-8000-0000000000c1', 'S-1');

insert into public.beds (tenant_id, room_id, label) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '30000000-0000-4000-8000-000000000001', 'A'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '30000000-0000-4000-8000-000000000001', 'B'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '30000000-0000-4000-8000-0000000000c1', 'A');

insert into public.residents (id, tenant_id, user_id, full_name, email, status, blocked_reason)
select ('60000000-0000-4000-8000-00000000000' || n)::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
       case when n = 1 then '00000000-0000-4000-8000-0000000000d1'::uuid end,
       'Student ' || n, 'student' || n || '@example.com',
       case when n = 8 then 'blocked' else 'applicant' end,
       case when n = 8 then 'Unpaid damage' end
from generate_series(1, 8) n;
insert into public.residents (id, tenant_id, full_name, email) values
  ('60000000-0000-4000-8000-0000000000c1', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Student S', 'students@example.com');

insert into public.booking_requests (id, tenant_id, reference, resident_id, booking_period_id, room_type_id, status,
                                     quoted_amount_minor, decided_at, decision_reason, idempotency_key)
select ('70000000-0000-4000-8000-00000000000' || n)::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'HA-AAAAA' || n,
       ('60000000-0000-4000-8000-00000000000' || n)::uuid, ('10000000-0000-4000-8000-00000000000' || period)::uuid,
       '20000000-0000-4000-8000-000000000001', status, 1000,
       case when status = 'rejected' then now() end, case when status = 'rejected' then 'No space' end, gen_random_uuid()
from (values
  (1, 1, 'submitted'), (2, 1, 'waitlisted'), (3, 1, 'under_review'), (4, 2, 'submitted'),
  (5, 3, 'submitted'), (6, 1, 'rejected'), (7, 4, 'submitted'), (8, 1, 'submitted')
) v(n, period, status);
insert into public.booking_requests (id, tenant_id, reference, resident_id, booking_period_id, room_type_id, quoted_amount_minor, idempotency_key) values
  ('70000000-0000-4000-8000-0000000000c1', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'HS-AAAAA1', '60000000-0000-4000-8000-0000000000c1',
   '10000000-0000-4000-8000-0000000000c1', '20000000-0000-4000-8000-0000000000c1', 1000, gen_random_uuid());

-- ---------------------------------------------------------------------------------------------
-- Who may approve
-- ---------------------------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.approve_booking_request(uuid)', 'execute'), 'visitors cannot approve');
select ok(has_function_privilege('authenticated', 'public.approve_booking_request(uuid)', 'execute'), 'signed-in staff can call it');

select tests.as_user('00000000-0000-4000-8000-0000000000a2');
select throws_ok($$select * from public.approve_booking_request('70000000-0000-4000-8000-000000000001')$$, '42501', null, 'front desk (no bookings.review) cannot approve');
select tests.as_owner();
select tests.as_user('00000000-0000-4000-8000-0000000000a1', 'aal1');
select throws_ok($$select * from public.approve_booking_request('70000000-0000-4000-8000-000000000001')$$, '42501', null, 'a hostel admin without MFA cannot approve');
select tests.as_owner();
select tests.as_user('00000000-0000-4000-8000-0000000000b1', 'aal2');
select throws_ok($$select * from public.approve_booking_request('70000000-0000-4000-8000-000000000001')$$, '42501', null, 'another hostel''s admin cannot approve');
select tests.as_owner();
select tests.as_user('00000000-0000-4000-8000-0000000000d1');
select throws_ok($$select * from public.approve_booking_request('70000000-0000-4000-8000-000000000001')$$, '42501', null, 'a student cannot approve their own request');
select tests.as_owner();
select tests.as_user('00000000-0000-4000-8000-0000000000e1', 'aal2');
select throws_ok($$select * from public.approve_booking_request('70000000-0000-4000-8000-000000000001')$$, '42501', null, 'break-glass is read-only and cannot approve');
select tests.as_owner();
select tests.as_user('00000000-0000-4000-8000-0000000000c1', 'aal2');
select throws_ok($$select * from public.approve_booking_request('70000000-0000-4000-8000-0000000000c1')$$, '42501', null, 'staff of a suspended hostel cannot approve');
select tests.as_owner();
select tests.as_user('00000000-0000-4000-8000-0000000000a4');
select throws_ok($$select * from public.approve_booking_request('70000000-0000-4000-8000-000000000999')$$, '42501', null, 'an unknown request looks the same as a forbidden one');

-- ---------------------------------------------------------------------------------------------
-- A successful approval (manager has bookings.review)
-- ---------------------------------------------------------------------------------------------
select lives_ok($$select * from public.approve_booking_request('70000000-0000-4000-8000-000000000001')$$, 'a manager can approve');
select tests.as_owner();
select is((select status from public.booking_requests where id = '70000000-0000-4000-8000-000000000001'), 'approved', 'the request is approved');
select is((select reviewed_by from public.booking_requests where id = '70000000-0000-4000-8000-000000000001'),
  '00000000-0000-4000-8000-0000000000a4'::uuid, 'the reviewer is recorded');
select ok((select decided_at is not null from public.booking_requests where id = '70000000-0000-4000-8000-000000000001'), 'the decision time is recorded');
select is((select status from public.reservations where booking_request_id = '70000000-0000-4000-8000-000000000001'), 'held', 'a held reservation is created');
select is((select hold_expires_at from public.reservations where booking_request_id = '70000000-0000-4000-8000-000000000001'),
  now() + interval '72 hours', 'the hold follows the hostel''s hold duration');
select is((select count(*)::int from public.audit_logs where action = 'booking.approved' and entity_id = '70000000-0000-4000-8000-000000000001'),
  1, 'the approval is audited');

-- ---------------------------------------------------------------------------------------------
-- State guards
-- ---------------------------------------------------------------------------------------------
select tests.as_user('00000000-0000-4000-8000-0000000000a4');
select throws_ok($$select * from public.approve_booking_request('70000000-0000-4000-8000-000000000001')$$, '55000', null, 'an approved request cannot be approved again');
select throws_ok($$select * from public.approve_booking_request('70000000-0000-4000-8000-000000000006')$$, '55000', null, 'a rejected request cannot be approved');
select throws_ok($$select * from public.approve_booking_request('70000000-0000-4000-8000-000000000007')$$, '55000', null, 'a request for a past period cannot be approved');
select throws_ok($$select * from public.approve_booking_request('70000000-0000-4000-8000-000000000008')$$, '55000', null, 'a blocked student cannot be approved');
select tests.as_owner();
select is((select count(*)::int from public.reservations where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 1, 'refused approvals create no reservation');

-- ---------------------------------------------------------------------------------------------
-- Capacity: 2 beds
-- ---------------------------------------------------------------------------------------------
select tests.as_user('00000000-0000-4000-8000-0000000000a4');
select lives_ok($$select * from public.approve_booking_request('70000000-0000-4000-8000-000000000002')$$, 'a waitlisted request can take the last bed');
select throws_ok($$select * from public.approve_booking_request('70000000-0000-4000-8000-000000000003')$$, 'AS409', null, 'no bed left: the next approval fails with no capacity');
select throws_ok($$select * from public.approve_booking_request('70000000-0000-4000-8000-000000000004')$$, 'AS409', null, 'an overlapping semester cannot use beds held for the year');
select lives_ok($$select * from public.approve_booking_request('70000000-0000-4000-8000-000000000005')$$, 'a period that does not overlap can still be approved');
select tests.as_owner();
select is((select status from public.booking_requests where id = '70000000-0000-4000-8000-000000000003'), 'under_review', 'a request refused for capacity keeps its status');
select is((select count(*)::int from public.reservations where booking_request_id = '70000000-0000-4000-8000-000000000003'), 0, 'and has no reservation');

update public.reservations set hold_expires_at = now() - interval '1 minute' where booking_request_id = '70000000-0000-4000-8000-000000000001';
select tests.as_user('00000000-0000-4000-8000-0000000000a4');
select lives_ok($$select * from public.approve_booking_request('70000000-0000-4000-8000-000000000003')$$, 'an overdue hold frees its bed for the next approval');

select tests.as_owner();
select * from finish();
rollback;
