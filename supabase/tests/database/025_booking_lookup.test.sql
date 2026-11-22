-- Phase 3, task 7. public.lookup_booking: needs reference and contact, returns status only, and is
-- rate-limited (Phase 3 acceptance criterion 5).
begin;
select plan(31);

create schema tests;
grant usage on schema tests to anon, authenticated, service_role;

create function tests.as_user(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  execute 'set local role authenticated';
end $$;

create function tests.as_owner() returns void
language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

create function tests.key(p_seed text default gen_random_uuid()::text) returns text
language sql as $$ select encode(sha256(convert_to(p_seed, 'UTF8')), 'hex') $$;

-- "outcome/status" for one lookup; a new visitor each time unless a key is given.
create function tests.find(p_reference text, p_contact text,
                           p_tenant uuid default 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                           p_key text default null) returns text
language sql as $$
  select l.outcome || '/' || coalesce(l.booking_status, '')
  from public.lookup_booking(p_tenant, p_reference, p_contact, coalesce(p_key, tests.key())) l
$$;

grant execute on all functions in schema tests to anon, authenticated, service_role;

insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000f1', 'outsider@example.com');

insert into public.tenants (id, slug, name, reference_prefix, status, suspended_at, suspension_reason) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'hostel-a', 'Hostel A', 'HA', 'active', null, null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'hostel-b', 'Hostel B', 'HB', 'active', null, null),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'hostel-s', 'Hostel S', 'HS', 'suspended', now(), 'Unpaid subscription'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'hostel-o', 'Hostel O', 'HN', 'onboarding', null, null);

insert into public.booking_periods (id, tenant_id, name, kind, starts_on, ends_on, status)
select ('10000000-0000-4000-8000-00000000000' || n)::uuid, t::uuid, 'Year', 'academic_year', '2027-09-01', '2028-07-31', 'open'
from (values (1, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), (2, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
             (3, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'), (4, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd')) v(n, t);

insert into public.room_types (id, tenant_id, name, slug, occupancy, is_published)
select ('20000000-0000-4000-8000-00000000000' || n)::uuid, t::uuid, 'Room', 'room', 4, true
from (values (1, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), (2, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
             (3, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'), (4, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd')) v(n, t);

insert into public.residents (id, tenant_id, full_name, email, phone_e164)
select ('60000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, t::uuid, 'Student ' || n,
       'student' || n || '@example.com', '+2332400000' || lpad(n::text, 2, '0')
from (values (1, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), (2, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
             (3, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), (4, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
             (5, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), (6, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
             (7, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), (8, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
             (9, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'), (10, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd')) v(n, t);

insert into public.booking_requests (id, tenant_id, reference, resident_id, booking_period_id, room_type_id, status,
                                     quoted_amount_minor, decided_at, decision_reason, idempotency_key)
select ('70000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, t::uuid, ref,
       ('60000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       ('10000000-0000-4000-8000-00000000000' || p)::uuid, ('20000000-0000-4000-8000-00000000000' || p)::uuid,
       s, 1000, case when s in ('approved', 'rejected') then now() end,
       case when s = 'rejected' then 'Private staff reason' end, gen_random_uuid()
from (values
  (1, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'HA-7K3Q9P', 1, 'submitted'),
  (2, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'HA-8M4R0T', 1, 'approved'),
  (3, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'HA-9N5S1V', 1, 'approved'),
  (4, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'HA-AP6T2W', 1, 'approved'),
  (5, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'HA-BQ7V3X', 1, 'rejected'),
  (6, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'HA-1K0Q9P', 1, 'submitted'),
  (7, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'HOL-7K3Q9P', 1, 'submitted'),
  (8, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'HA-7K3Q9P', 2, 'submitted'),
  (9, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'HS-7K3Q9P', 3, 'submitted'),
  (10, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'HN-7K3Q9P', 4, 'submitted')
) v(n, t, ref, p, s);

insert into public.reservations (tenant_id, booking_request_id, room_type_id, booking_period_id, status, hold_expires_at, confirmed_at) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '70000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'held', now() + interval '1 day', null),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '70000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'confirmed', null, now()),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '70000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'fulfilled', null, now());

-- Access and shape
select ok(not has_function_privilege('anon', 'public.lookup_booking(uuid, text, text, text)', 'execute'), 'visitors cannot call it directly');
select ok(not has_function_privilege('authenticated', 'public.lookup_booking(uuid, text, text, text)', 'execute'), 'signed-in users cannot call it directly');
select ok(has_function_privilege('service_role', 'public.lookup_booking(uuid, text, text, text)', 'execute'), 'the server lookup module can call it');
select is(pg_get_function_result('public.lookup_booking(uuid, text, text, text)'::regprocedure),
  'TABLE(outcome text, booking_status text)', 'it can return only an outcome and a status');
select tests.as_user('00000000-0000-4000-8000-0000000000f1');
select throws_ok($$select * from public.lookup_booking('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'HA-7K3Q9P', 'student1@example.com', repeat('a', 64))$$,
  '42501', null, 'a signed-in user is refused');
select tests.as_owner();

-- Matching
select is(tests.find('HA-7K3Q9P', 'student1@example.com'), 'found/submitted', 'reference and email find the booking');
select is(tests.find(' ha-7k3q9p ', ' STUDENT1@Example.com '), 'found/submitted', 'case and spaces do not matter');
select is(tests.find('HA-7K3Q9P', '+233240000001'), 'found/submitted', 'reference and phone find the booking');
select is(tests.find('HA-7K3Q9P', 'student2@example.com'), 'not_found/', 'another student''s email does not match');
select is(tests.find('HA-7K3Q9P', '+233240000002'), 'not_found/', 'another student''s phone does not match');
select is(tests.find('HA-7K3Q9P', '   '), 'not_found/', 'a contact is required');
select is(tests.find('HA-000000', 'student1@example.com'), 'not_found/', 'an unknown reference looks the same');
select is(tests.find('nonsense', 'student1@example.com'), 'not_found/', 'a malformed reference looks the same');
select is(tests.find('HA-7K3Q9P', '%'), 'not_found/', 'wildcards do not match');
select is(tests.find('HA-7K3Q9P', 'student8@example.com'), 'not_found/', 'the same reference at another hostel does not leak across');
select is(tests.find('HA-7K3Q9P', 'student8@example.com', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 'found/submitted', 'each hostel finds its own booking');
select is(tests.find('HA-1K0Q9P', 'student6@example.com', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 'not_found/', 'a booking cannot be found through another hostel');

-- Statuses
select is(tests.find('HA-8M4R0T', 'student2@example.com'), 'found/approved', 'a held booking shows approved');
select is(tests.find('HA-9N5S1V', 'student3@example.com'), 'found/confirmed', 'a confirmed reservation shows confirmed');
select is(tests.find('HA-AP6T2W', 'student4@example.com'), 'found/checked_in', 'a fulfilled reservation shows checked in');
select is(tests.find('HA-BQ7V3X', 'student5@example.com'), 'found/rejected', 'a rejection shows only the status, not the reason');
select is(tests.find('ha-ik0q9p', 'student6@example.com'), 'found/submitted', 'look-alike I and O are forgiven in the code');
select is(tests.find('HOL-7K3Q9P', 'student7@example.com'), 'found/submitted', 'a prefix containing O and L is not altered');
select is(tests.find('HS-7K3Q9P', 'student9@example.com', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'), 'found/submitted', 'a student of a suspended hostel can still check');
select is(tests.find('HN-7K3Q9P', 'student10@example.com', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'), 'not_found/', 'a hostel still onboarding finds nothing');
select throws_ok($$select * from public.lookup_booking('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'HA-7K3Q9P', 'student1@example.com', '41.66.1.1')$$,
  '22023', null, 'a raw IP address is refused as the client key');

-- Rate limit: 5 per 15 minutes per visitor, counting failed attempts
select is((select count(*)::int from generate_series(1, 5) n
           where tests.find('HA-000000', 'guess' || n || '@example.com', p_key => tests.key('visitor-1')) = 'not_found/'),
  5, 'five failed attempts are answered normally');
select is(tests.find('HA-7K3Q9P', 'student1@example.com', p_key => tests.key('visitor-1')), 'rate_limited/', 'the sixth is refused even with correct details');
select is(tests.find('HA-7K3Q9P', 'student1@example.com', p_key => tests.key('visitor-2')), 'found/submitted', 'another visitor is unaffected');
update private.rate_limits set window_start = now() - interval '16 minutes' where bucket_key = 'booking_lookup:' || tests.key('visitor-1');
select is(tests.find('HA-7K3Q9P', 'student1@example.com', p_key => tests.key('visitor-1')), 'found/submitted', 'the limit resets after 15 minutes');

set local role service_role;
select is(tests.find('HA-7K3Q9P', 'student1@example.com'), 'found/submitted', 'the service role can run a lookup');
reset role;

select * from finish();
rollback;
