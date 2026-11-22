-- Phase 3, task 2. public.submit_booking_request: guards, price snapshot, idempotency, rate limit
-- (docs/BOOKING_AND_PAYMENT_FLOWS.md §2.1, §4, §5). Runs as the API roles with JWT claims.
begin;
select plan(41);

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

-- Valid defaults for hostel A; each test overrides what it is about.
create function tests.submit(
  p_key uuid default gen_random_uuid(),
  p_tenant uuid default 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  p_period uuid default '10000000-0000-4000-8000-0000000000a1',
  p_room uuid default '20000000-0000-4000-8000-0000000000a1',
  p_name text default 'Ama Mensah',
  p_phone text default '+233241234567',
  p_student_id text default null,
  p_gender text default null,
  p_note text default null
) returns text
language sql as $$
  select booking_reference from public.submit_booking_request(
    p_tenant, p_period, p_room, p_key, p_name, p_phone, 'University of Ghana', null, null, p_student_id, p_gender, p_note)
$$;

grant execute on all functions in schema tests to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------------------------
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000d1', 'student1@example.com', now()),
  ('00000000-0000-4000-8000-0000000000d2', 'student2@example.com', now()),
  ('00000000-0000-4000-8000-0000000000d3', 'blocked@example.com', now()),
  ('00000000-0000-4000-8000-0000000000d5', 'busy@example.com', now());
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000d4', 'unverified@example.com');

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

insert into public.tenant_settings (tenant_id, deposit_policy, deposit_value, student_id_required, gender_policy_enforced) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'fixed', 59000, false, false),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'percent', 30, true, true),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'none', 0, false, false),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'none', 0, false, false);

insert into public.booking_periods (id, tenant_id, name, kind, starts_on, ends_on, status, booking_opens_at, booking_closes_at) values
  ('10000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'A Year', 'academic_year', '2027-09-01', '2028-07-31', 'open', null, null),
  ('10000000-0000-4000-8000-0000000000a2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'A Draft', 'semester', '2028-09-01', '2028-12-31', 'draft', null, null),
  ('10000000-0000-4000-8000-0000000000a3', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'A Closed window', 'semester', '2029-01-01', '2029-05-31', 'open', now() - interval '10 days', now() - interval '1 day'),
  ('10000000-0000-4000-8000-0000000000a4', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'A No price', 'semester', '2029-09-01', '2029-12-31', 'open', null, null),
  ('10000000-0000-4000-8000-0000000000b1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'B Year', 'academic_year', '2027-09-01', '2028-07-31', 'open', null, null),
  ('10000000-0000-4000-8000-0000000000c1', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'S Year', 'academic_year', '2027-09-01', '2028-07-31', 'open', null, null),
  ('10000000-0000-4000-8000-0000000000e1', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'U Year', 'academic_year', '2027-09-01', '2028-07-31', 'open', null, null);

-- Six extra open periods for the rate-limit test.
insert into public.booking_periods (id, tenant_id, name, kind, starts_on, ends_on, status)
select ('10000000-0000-4000-8000-00000000f00' || n)::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Extra ' || n, 'short_stay',
       date '2030-01-01' + n * 40, date '2030-01-20' + n * 40, 'open'
from generate_series(1, 6) n;

insert into public.room_types (id, tenant_id, name, slug, occupancy, gender_policy, is_published) values
  ('20000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2 in a room', '2-in-a-room', 2, 'any', true),
  ('20000000-0000-4000-8000-0000000000a2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Hidden', 'hidden', 2, 'any', false),
  ('20000000-0000-4000-8000-0000000000b1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'B Female', 'female', 2, 'female', true),
  ('20000000-0000-4000-8000-0000000000c1', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'S Single', 'single', 1, 'any', true),
  ('20000000-0000-4000-8000-0000000000e1', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'U Single', 'single', 1, 'any', true);

insert into public.room_type_prices (tenant_id, room_type_id, booking_period_id, amount_minor, deposit_minor) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a1', 450000, 100000),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a2', 450000, 100000),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a3', 450000, 100000),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-0000000000a2', '10000000-0000-4000-8000-0000000000a1', 450000, 100000),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '20000000-0000-4000-8000-0000000000b1', '10000000-0000-4000-8000-0000000000b1', 800000, 200000),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '20000000-0000-4000-8000-0000000000c1', '10000000-0000-4000-8000-0000000000c1', 700000, 0),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '20000000-0000-4000-8000-0000000000e1', '10000000-0000-4000-8000-0000000000e1', 700000, 0);

insert into public.room_type_prices (tenant_id, room_type_id, booking_period_id, amount_minor, deposit_minor)
select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-0000000000a1',
       ('10000000-0000-4000-8000-00000000f00' || n)::uuid, 100000, 0
from generate_series(1, 6) n;

insert into public.residents (tenant_id, user_id, full_name, email, status, blocked_reason) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000d3', 'Blocked Student', 'blocked@example.com', 'blocked', 'Unpaid damage');

-- ---------------------------------------------------------------------------------------------
-- Access and helpers
-- ---------------------------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.submit_booking_request(uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, text)', 'execute'),
  'visitors cannot submit without signing in');
select ok(has_function_privilege('authenticated', 'public.submit_booking_request(uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, text)', 'execute'),
  'signed-in students can submit');

select is(app.quote_deposit('none', 0, 450000, 100000), 0::bigint, 'no deposit');
select is(app.quote_deposit('fixed', 59000, 450000, 100000), 100000::bigint, 'fixed uses the room price deposit, not the hostel-wide value');
select is(app.quote_deposit('percent', 30, 450000, 100000), 135000::bigint, 'percent is a share of the price');
select is(app.quote_deposit('percent', 33, 1001, 0), 330::bigint, 'percent rounds to the nearest pesewa');
select is(app.quote_deposit('full', 0, 450000, 100000), 450000::bigint, 'full deposit is the whole price');

select is((select count(*)::int from generate_series(1, 300) where app.generate_booking_reference('HA') !~ '^HA-[0-9A-HJKMNP-TV-Z]{6}$'),
  0, 'references always use the prefix and Crockford alphabet');

-- ---------------------------------------------------------------------------------------------
-- Refusals
-- ---------------------------------------------------------------------------------------------
select tests.as_user('00000000-0000-4000-8000-0000000000d4');
select throws_ok($$select tests.submit()$$, '42501', null, 'an unverified email cannot submit (D-2)');

select tests.as_owner();
select tests.as_user('00000000-0000-4000-8000-0000000000d3');
select throws_ok($$select tests.submit()$$, '42501', null, 'a blocked resident cannot submit');

select tests.as_owner();
select tests.as_user('00000000-0000-4000-8000-0000000000d1');
select throws_ok($$select tests.submit(p_tenant => 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', p_period => '10000000-0000-4000-8000-0000000000e1', p_room => '20000000-0000-4000-8000-0000000000e1')$$,
  '42501', null, 'an unpublished hostel takes no requests');
select throws_ok($$select tests.submit(p_tenant => 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', p_period => '10000000-0000-4000-8000-0000000000c1', p_room => '20000000-0000-4000-8000-0000000000c1')$$,
  '42501', null, 'a suspended hostel takes no requests');
select throws_ok($$select tests.submit(p_room => '20000000-0000-4000-8000-0000000000b1')$$,
  '22023', null, 'another hostel''s room type is refused');
select throws_ok($$select tests.submit(p_period => '10000000-0000-4000-8000-0000000000a2')$$,
  '22023', null, 'a draft period is refused');
select throws_ok($$select tests.submit(p_period => '10000000-0000-4000-8000-0000000000a3')$$,
  '22023', null, 'a period whose booking window has closed is refused');
select throws_ok($$select tests.submit(p_room => '20000000-0000-4000-8000-0000000000a2')$$,
  '22023', null, 'an unpublished room type is refused');
select throws_ok($$select tests.submit(p_period => '10000000-0000-4000-8000-0000000000a4')$$,
  '22023', null, 'a room type with no price is refused');
select throws_ok($$select tests.submit(p_phone => '0241234567')$$, '22023', null, 'a phone number must be in E.164');
select throws_ok($$select tests.submit(p_name => ' A ')$$, '22023', null, 'a full name is required');
select throws_ok($$select tests.submit(p_tenant => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', p_period => '10000000-0000-4000-8000-0000000000b1', p_room => '20000000-0000-4000-8000-0000000000b1', p_gender => 'female')$$,
  '22023', null, 'a hostel can require a student ID');
select throws_ok($$select tests.submit(p_tenant => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', p_period => '10000000-0000-4000-8000-0000000000b1', p_room => '20000000-0000-4000-8000-0000000000b1', p_student_id => 'UG1', p_gender => 'male')$$,
  '22023', null, 'a gendered room refuses the other gender when the hostel enforces it');

-- ---------------------------------------------------------------------------------------------
-- A successful request
-- ---------------------------------------------------------------------------------------------
select matches(tests.submit('80000000-0000-4000-8000-0000000000a1', p_gender => 'female', p_note => 'Private note'),
  '^HA-[0-9A-HJKMNP-TV-Z]{6}$', 'a valid request gets a reference');
select is((select status from public.booking_requests where idempotency_key = '80000000-0000-4000-8000-0000000000a1'),
  'submitted', 'the request starts as submitted');
select is((select quoted_amount_minor from public.booking_requests where idempotency_key = '80000000-0000-4000-8000-0000000000a1'),
  450000::bigint, 'the price is snapshotted');
select is((select quoted_deposit_minor from public.booking_requests where idempotency_key = '80000000-0000-4000-8000-0000000000a1'),
  100000::bigint, 'the deposit is snapshotted from the room price');
select is((select count(*)::int from public.reservations), 0, 'submitting does not hold capacity');
select is(tests.submit('80000000-0000-4000-8000-0000000000a1'),
  (select reference from public.booking_requests where idempotency_key = '80000000-0000-4000-8000-0000000000a1'),
  'submitting twice with the same key returns the same reference');
select is((select count(*)::int from public.booking_requests), 1, 'the retry created nothing new');
select throws_ok($$select tests.submit()$$, '23505', null, 'a second live request for the same period is refused');

select tests.as_owner();
update public.room_type_prices set amount_minor = 999999 where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  and room_type_id = '20000000-0000-4000-8000-0000000000a1' and booking_period_id = '10000000-0000-4000-8000-0000000000a1';
select is((select quoted_amount_minor from public.booking_requests where idempotency_key = '80000000-0000-4000-8000-0000000000a1'),
  450000::bigint, 'a later price change does not alter the request');
select is((select email::text from public.residents where user_id = '00000000-0000-4000-8000-0000000000d1'),
  'student1@example.com', 'the resident uses the verified account email');
select is((select gender from public.residents where user_id = '00000000-0000-4000-8000-0000000000d1'),
  null, 'gender is not stored when the hostel does not enforce it');
select is((select count(*)::int from public.audit_logs where action = 'booking.submitted'), 1, 'the submission is audited once');
select ok((select not (after ? 'student_note') from public.audit_logs where action = 'booking.submitted'), 'the audit entry has no student note');

select tests.as_user('00000000-0000-4000-8000-0000000000d1');
select matches(tests.submit(p_tenant => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', p_period => '10000000-0000-4000-8000-0000000000b1',
    p_room => '20000000-0000-4000-8000-0000000000b1', p_student_id => 'UG1', p_gender => 'female'),
  '^HB-', 'the same student can apply to a second hostel');
select tests.as_owner();
select is((select count(*)::int from public.residents where user_id = '00000000-0000-4000-8000-0000000000d1'),
  2, 'each hostel keeps its own resident record');

select tests.as_user('00000000-0000-4000-8000-0000000000d2');
select matches(tests.submit('80000000-0000-4000-8000-0000000000a1'), '^HA-',
  'another student using the same key gets their own new request');
select is((select count(*)::int from public.booking_requests), 1, 'and sees only that request');
select tests.as_owner();

-- ---------------------------------------------------------------------------------------------
-- Rate limit: 5 per hour per user; retries do not count
-- ---------------------------------------------------------------------------------------------
select tests.as_user('00000000-0000-4000-8000-0000000000d5');
select lives_ok($$select tests.submit(('80000000-0000-4000-8000-00000000f00' || n)::uuid,
    p_period => ('10000000-0000-4000-8000-00000000f00' || n)::uuid) from generate_series(1, 5) n$$,
  'five requests in an hour are allowed');
select throws_ok($$select tests.submit(p_period => '10000000-0000-4000-8000-00000000f006')$$,
  'AS429', null, 'the sixth request in an hour is refused');
select lives_ok($$select tests.submit('80000000-0000-4000-8000-00000000f001', p_period => '10000000-0000-4000-8000-00000000f001')$$,
  'a retry of an existing request still works at the limit');

select tests.as_owner();
select * from finish();
rollback;
