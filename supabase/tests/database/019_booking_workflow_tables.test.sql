-- Phase 3, task 1. booking_requests and reservations: constraints, audit, isolation and RBAC
-- (docs/DATABASE_DESIGN.md §4.4, docs/RBAC_MATRIX.md §4). Queries run as the API roles with JWT
-- claims, exactly as PostgREST would.
begin;
select plan(53);

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
-- Fixtures: hostels A and B active, S suspended, Z disposable (offboarding test)
-- ---------------------------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin@a.test'),
  ('00000000-0000-4000-8000-0000000000a2', 'frontdesk@a.test'),
  ('00000000-0000-4000-8000-0000000000a3', 'maintenance@a.test'),
  ('00000000-0000-4000-8000-0000000000b1', 'admin@b.test'),
  ('00000000-0000-4000-8000-0000000000c1', 'admin@s.test'),
  ('00000000-0000-4000-8000-0000000000d1', 'student1@a.test'),
  ('00000000-0000-4000-8000-0000000000d2', 'student2@a.test'),
  ('00000000-0000-4000-8000-0000000000d3', 'student@b.test'),
  ('00000000-0000-4000-8000-0000000000d4', 'student@s.test'),
  ('00000000-0000-4000-8000-0000000000e1', 'platform@adestay.test'),
  ('00000000-0000-4000-8000-0000000000f1', 'outsider@example.com');

insert into public.tenants (id, slug, name, reference_prefix, status, suspended_at, suspension_reason) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'hostel-a', 'Hostel A', 'HA', 'active', null, null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'hostel-b', 'Hostel B', 'HB', 'active', null, null),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'hostel-s', 'Hostel S', 'HS', 'suspended', now(), 'Unpaid subscription'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'hostel-z', 'Hostel Z', 'HZ', 'active', null, null);

insert into public.tenant_memberships (tenant_id, user_id, role, permission_set_id, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a1', 'hostel_admin', null, 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a2', 'staff',
     (select id from public.permission_sets where key = 'front_desk' and is_system), 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a3', 'staff',
     (select id from public.permission_sets where key = 'maintenance' and is_system), 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-4000-8000-0000000000b1', 'hostel_admin', null, 'active'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '00000000-0000-4000-8000-0000000000c1', 'hostel_admin', null, 'active');

insert into public.platform_admins (user_id) values ('00000000-0000-4000-8000-0000000000e1');
insert into public.platform_access_grants (platform_admin_user_id, tenant_id, reason, granted_at, expires_at) values
  ('00000000-0000-4000-8000-0000000000e1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Checking a booking question',
   now() - interval '5 minutes', now() + interval '1 hour');

insert into public.residents (id, tenant_id, user_id, full_name, email) values
  ('60000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000d1', 'Student One', 'student1@a.test'),
  ('60000000-0000-4000-8000-0000000000a2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000d2', 'Student Two', 'student2@a.test'),
  ('60000000-0000-4000-8000-0000000000b1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-4000-8000-0000000000d3', 'Student Bee', 'student@b.test'),
  ('60000000-0000-4000-8000-0000000000c1', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '00000000-0000-4000-8000-0000000000d4', 'Student Ess', 'student@s.test'),
  ('60000000-0000-4000-8000-0000000000d1', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', null, 'Student Zed', 'student@z.test');

insert into public.booking_periods (id, tenant_id, name, kind, starts_on, ends_on, status) values
  ('10000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'A Year', 'academic_year', '2026-09-01', '2027-07-31', 'open'),
  ('10000000-0000-4000-8000-0000000000b1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'B Year', 'academic_year', '2026-09-01', '2027-07-31', 'open'),
  ('10000000-0000-4000-8000-0000000000c1', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'S Year', 'academic_year', '2026-09-01', '2027-07-31', 'open'),
  ('10000000-0000-4000-8000-0000000000d1', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Z Year', 'academic_year', '2026-09-01', '2027-07-31', 'open');

insert into public.room_types (id, tenant_id, name, slug, occupancy, is_published) values
  ('20000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2 in a room', '2-in-a-room', 2, true),
  ('20000000-0000-4000-8000-0000000000a2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '4 in a room', '4-in-a-room', 4, true),
  ('20000000-0000-4000-8000-0000000000b1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'B Single', 'single', 1, true),
  ('20000000-0000-4000-8000-0000000000c1', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'S Single', 'single', 1, true),
  ('20000000-0000-4000-8000-0000000000d1', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Z Single', 'single', 1, true);

insert into public.booking_requests
  (id, tenant_id, reference, resident_id, booking_period_id, room_type_id, status, quoted_amount_minor, quoted_deposit_minor,
   student_note, decided_at, idempotency_key) values
  ('70000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'HA-7K3Q9P', '60000000-0000-4000-8000-0000000000a1',
   '10000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a1', 'approved', 450000, 100000,
   'I have a private medical need', now(), '80000000-0000-4000-8000-0000000000a1'),
  ('70000000-0000-4000-8000-0000000000a2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'HA-8M4R0T', '60000000-0000-4000-8000-0000000000a2',
   '10000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a1', 'submitted', 450000, 100000,
   null, null, '80000000-0000-4000-8000-0000000000a2'),
  ('70000000-0000-4000-8000-0000000000b1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'HB-7K3Q9P', '60000000-0000-4000-8000-0000000000b1',
   '10000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-0000000000b1', 'approved', 800000, 200000,
   null, now(), '80000000-0000-4000-8000-0000000000b1'),
  ('70000000-0000-4000-8000-0000000000c1', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'HS-7K3Q9P', '60000000-0000-4000-8000-0000000000c1',
   '10000000-0000-4000-8000-0000000000c1', '20000000-0000-4000-8000-0000000000c1', 'submitted', 700000, 0,
   null, null, '80000000-0000-4000-8000-0000000000c1'),
  ('70000000-0000-4000-8000-0000000000d1', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'HZ-7K3Q9P', '60000000-0000-4000-8000-0000000000d1',
   '10000000-0000-4000-8000-0000000000d1', '20000000-0000-4000-8000-0000000000d1', 'approved', 700000, 0,
   null, now(), '80000000-0000-4000-8000-0000000000d1');

insert into public.reservations (id, tenant_id, booking_request_id, room_type_id, booking_period_id, status, hold_expires_at) values
  ('90000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '70000000-0000-4000-8000-0000000000a1',
   '20000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a1', 'held', now() + interval '120 hours'),
  ('90000000-0000-4000-8000-0000000000b1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '70000000-0000-4000-8000-0000000000b1',
   '20000000-0000-4000-8000-0000000000b1', '10000000-0000-4000-8000-0000000000b1', 'held', now() + interval '120 hours'),
  ('90000000-0000-4000-8000-0000000000d1', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', '70000000-0000-4000-8000-0000000000d1',
   '20000000-0000-4000-8000-0000000000d1', '10000000-0000-4000-8000-0000000000d1', 'held', now() + interval '120 hours');

-- ---------------------------------------------------------------------------------------------
-- booking_requests constraints (as the owner, so only the database rules apply)
-- ---------------------------------------------------------------------------------------------
select throws_ok($$insert into public.booking_requests (tenant_id, reference, resident_id, booking_period_id, room_type_id, status, quoted_amount_minor, decision_reason, decided_at, idempotency_key)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'HA-ILOU00', '60000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a1', 'rejected', 1000, 'x', now(), gen_random_uuid())$$,
  '23514', null, 'a reference must use the Crockford alphabet');
select throws_ok($$insert into public.booking_requests (tenant_id, reference, resident_id, booking_period_id, room_type_id, status, quoted_amount_minor, decision_reason, decided_at, idempotency_key)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'HA-7K3Q9P', '60000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a1', 'rejected', 1000, 'x', now(), gen_random_uuid())$$,
  '23505', null, 'references are unique within a hostel');
select throws_ok($$insert into public.booking_requests (tenant_id, reference, resident_id, booking_period_id, room_type_id, status, quoted_amount_minor, decision_reason, decided_at, idempotency_key)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'HA-AAAAA1', '60000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a1', 'rejected', 1000, 'x', now(), '80000000-0000-4000-8000-0000000000a1')$$,
  '23505', null, 'an idempotency key is used once per student');
select throws_ok($$insert into public.booking_requests (tenant_id, reference, resident_id, booking_period_id, room_type_id, quoted_amount_minor, idempotency_key)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'HA-AAAAA2', '60000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a2', 1000, gen_random_uuid())$$,
  '23505', null, 'one live request per student per period');
select lives_ok($$insert into public.booking_requests (tenant_id, reference, resident_id, booking_period_id, room_type_id, status, quoted_amount_minor, decision_reason, decided_at, idempotency_key)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'HA-AAAAA3', '60000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a2', 'rejected', 1000, 'No space', now(), gen_random_uuid())$$,
  'a finished request does not count as live');
select throws_ok($$insert into public.booking_requests (tenant_id, reference, resident_id, booking_period_id, room_type_id, quoted_amount_minor, idempotency_key)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'HA-AAAAA4', '60000000-0000-4000-8000-0000000000b1', '10000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a1', 1000, gen_random_uuid())$$,
  '23503', null, 'a request cannot use another hostel''s resident (composite FK)');
select throws_ok($$insert into public.booking_requests (tenant_id, reference, resident_id, booking_period_id, room_type_id, status, quoted_amount_minor, decision_reason, decided_at, idempotency_key)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'HA-AAAAA5', '60000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000b1', 'rejected', 1000, 'x', now(), gen_random_uuid())$$,
  '23503', null, 'a request cannot use another hostel''s room type (composite FK)');
select throws_ok($$insert into public.booking_requests (tenant_id, reference, resident_id, booking_period_id, room_type_id, status, quoted_amount_minor, quoted_deposit_minor, decision_reason, decided_at, idempotency_key)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'HA-AAAAA6', '60000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a1', 'rejected', 1000, 2000, 'x', now(), gen_random_uuid())$$,
  '23514', null, 'a quoted deposit cannot exceed the quoted price');
select throws_ok($$insert into public.booking_requests (tenant_id, reference, resident_id, booking_period_id, room_type_id, status, quoted_amount_minor, decided_at, idempotency_key)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'HA-AAAAA7', '60000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a1', 'rejected', 1000, now(), gen_random_uuid())$$,
  '23514', null, 'a rejection needs a reason');
select throws_ok($$update public.booking_requests set status = 'approved' where id = '70000000-0000-4000-8000-0000000000a2'$$,
  '23514', null, 'an approval needs a decision time');
select throws_ok($$update public.booking_requests set status = 'cancelled', cancelled_at = now() where id = '70000000-0000-4000-8000-0000000000a2'$$,
  '23514', null, 'a cancellation needs a reason');

-- ---------------------------------------------------------------------------------------------
-- reservations constraints
-- ---------------------------------------------------------------------------------------------
select throws_ok($$insert into public.reservations (tenant_id, booking_request_id, room_type_id, booking_period_id, hold_expires_at)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '70000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a1', now())$$,
  '23505', null, 'one reservation per request');
select throws_ok($$insert into public.reservations (tenant_id, booking_request_id, room_type_id, booking_period_id, hold_expires_at)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '70000000-0000-4000-8000-0000000000a2', '20000000-0000-4000-8000-0000000000a2', '10000000-0000-4000-8000-0000000000a1', now())$$,
  '23503', null, 'a reservation must match its request''s room type');
select throws_ok($$insert into public.reservations (tenant_id, booking_request_id, room_type_id, booking_period_id)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '70000000-0000-4000-8000-0000000000a2', '20000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a1')$$,
  '23514', null, 'a held reservation needs an expiry time');
select throws_ok($$update public.reservations set status = 'expired' where id = '90000000-0000-4000-8000-0000000000a1'$$,
  '23514', null, 'an ended reservation needs an end time');
select throws_ok($$update public.reservations set status = 'confirmed' where id = '90000000-0000-4000-8000-0000000000a1'$$,
  '23514', null, 'a confirmed reservation needs a confirmation time');

-- ---------------------------------------------------------------------------------------------
-- Delete behaviour
-- ---------------------------------------------------------------------------------------------
select throws_ok($$delete from public.booking_periods where id = '10000000-0000-4000-8000-0000000000a1'$$,
  '23503', null, 'a period with bookings cannot be deleted');
select throws_ok($$delete from public.room_types where id = '20000000-0000-4000-8000-0000000000a1'$$,
  '23503', null, 'a room type with bookings cannot be deleted');
select throws_ok($$delete from public.residents where id = '60000000-0000-4000-8000-0000000000a1'$$,
  '23503', null, 'a resident with bookings cannot be deleted');
select lives_ok($$delete from public.tenants where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'$$,
  'offboarding a whole hostel still removes its bookings');

-- ---------------------------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------------------------
select is((select count(*)::int from public.audit_logs where action = 'booking_requests.created' and entity_id = '70000000-0000-4000-8000-0000000000a1'),
  1, 'creating a request is audited');
select is((select count(*)::int from public.audit_logs where action = 'reservations.created' and entity_id = '90000000-0000-4000-8000-0000000000a1'),
  1, 'creating a reservation is audited');
select is((select after ->> 'student_note' from public.audit_logs where action = 'booking_requests.created' and entity_id = '70000000-0000-4000-8000-0000000000a1'),
  '[redacted]', 'the student''s note is not copied into the audit log');
select ok((select not (after ? 'idempotency_key') from public.audit_logs where action = 'booking_requests.created' and entity_id = '70000000-0000-4000-8000-0000000000a1'),
  'the idempotency key is not copied into the audit log');

-- ---------------------------------------------------------------------------------------------
-- Visitors
-- ---------------------------------------------------------------------------------------------
select tests.as_anon();
select throws_ok('select * from public.booking_requests', '42501', null, 'anon cannot read booking requests');
select throws_ok('select * from public.reservations', '42501', null, 'anon cannot read reservations');

-- ---------------------------------------------------------------------------------------------
-- Students see only their own
-- ---------------------------------------------------------------------------------------------
select tests.as_owner();
select tests.as_user('00000000-0000-4000-8000-0000000000d1');
select is((select count(*)::int from public.booking_requests where id = '70000000-0000-4000-8000-0000000000a1'), 1, 'a student sees their own request');
select is((select count(*)::int from public.booking_requests where resident_id <> '60000000-0000-4000-8000-0000000000a1'), 0, 'a student sees no other student''s request');
select is((select count(*)::int from public.reservations), 1, 'a student sees their own reservation');
select throws_ok($$update public.booking_requests set status = 'withdrawn' where id = '70000000-0000-4000-8000-0000000000a1'$$,
  '42501', null, 'a student cannot change their own request directly');

select tests.as_owner();
select tests.as_user('00000000-0000-4000-8000-0000000000d2');
select is((select count(*)::int from public.reservations), 0, 'a student cannot see a classmate''s reservation');

select tests.as_owner();
select tests.as_user('00000000-0000-4000-8000-0000000000d3');
select is((select count(*)::int from public.booking_requests where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0, 'a student of hostel B sees nothing from hostel A');

select tests.as_owner();
select tests.as_user('00000000-0000-4000-8000-0000000000f1');
select is((select count(*)::int from public.booking_requests), 0, 'an outsider sees no requests');
select is((select count(*)::int from public.reservations), 0, 'an outsider sees no reservations');

-- ---------------------------------------------------------------------------------------------
-- Staff
-- ---------------------------------------------------------------------------------------------
select tests.as_owner();
select tests.as_user('00000000-0000-4000-8000-0000000000a2');
select is((select count(*)::int from public.booking_requests), 3, 'front desk (bookings.read) sees their hostel''s requests');
select is((select count(*)::int from public.booking_requests where tenant_id <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0, 'front desk sees no other hostel''s requests');
select is((select count(*)::int from public.reservations), 1, 'front desk sees their hostel''s reservations only');

select tests.as_owner();
select tests.as_user('00000000-0000-4000-8000-0000000000a3');
select is((select count(*)::int from public.booking_requests), 0, 'maintenance staff (no bookings.read) see no requests');
select is((select count(*)::int from public.reservations), 0, 'maintenance staff see no reservations');

select tests.as_owner();
select tests.as_user('00000000-0000-4000-8000-0000000000a1', 'aal1');
select is((select count(*)::int from public.booking_requests), 0, 'a hostel admin without MFA sees no requests');

select tests.as_owner();
select tests.as_user('00000000-0000-4000-8000-0000000000a1', 'aal2');
select is((select count(*)::int from public.booking_requests), 3, 'a hostel admin with MFA sees their hostel''s requests');
select is((select count(*)::int from public.booking_requests where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 0, 'a hostel admin sees nothing from another hostel');

-- Nobody writes directly, not even a hostel admin with MFA.
select throws_ok($$insert into public.booking_requests (tenant_id, reference, resident_id, booking_period_id, room_type_id, quoted_amount_minor, idempotency_key)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'HA-AAAAA8', '60000000-0000-4000-8000-0000000000a2', '10000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a2', 1000, gen_random_uuid())$$,
  '42501', null, 'an admin cannot insert a request directly');
select throws_ok($$update public.booking_requests set status = 'rejected' where id = '70000000-0000-4000-8000-0000000000a2'$$,
  '42501', null, 'an admin cannot update a request directly');
select throws_ok($$delete from public.booking_requests where id = '70000000-0000-4000-8000-0000000000a2'$$,
  '42501', null, 'an admin cannot delete a request');
select throws_ok($$insert into public.reservations (tenant_id, booking_request_id, room_type_id, booking_period_id, hold_expires_at)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '70000000-0000-4000-8000-0000000000a2', '20000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a1', now())$$,
  '42501', null, 'an admin cannot insert a reservation directly');
select throws_ok($$update public.reservations set hold_expires_at = now() + interval '1 year' where id = '90000000-0000-4000-8000-0000000000a1'$$,
  '42501', null, 'an admin cannot extend a hold directly');
select throws_ok($$delete from public.reservations where id = '90000000-0000-4000-8000-0000000000a1'$$,
  '42501', null, 'an admin cannot delete a reservation');

-- ---------------------------------------------------------------------------------------------
-- Platform admin and suspension
-- ---------------------------------------------------------------------------------------------
select tests.as_owner();
select tests.as_user('00000000-0000-4000-8000-0000000000e1', 'aal2');
select is((select count(*)::int from public.booking_requests where tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 1, 'break-glass lets a platform admin read that hostel');
select is((select count(*)::int from public.booking_requests where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0, 'a platform admin without a grant sees nothing');

select tests.as_owner();
select tests.as_user('00000000-0000-4000-8000-0000000000e1', 'aal1');
select is((select count(*)::int from public.booking_requests), 0, 'break-glass does not work without MFA');

select tests.as_owner();
select tests.as_user('00000000-0000-4000-8000-0000000000c1', 'aal2');
select is((select count(*)::int from public.booking_requests), 0, 'staff of a suspended hostel see no requests');

select tests.as_owner();
select tests.as_user('00000000-0000-4000-8000-0000000000d4');
select is((select count(*)::int from public.booking_requests), 1, 'a student of a suspended hostel can still read their own request');

select tests.as_owner();
select * from finish();
rollback;
