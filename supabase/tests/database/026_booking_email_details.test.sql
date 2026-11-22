-- Phase 3, task 9. Who can read the details of a booking email.
begin;
select plan(17);

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

create function tests.visible() returns integer
language sql as $$
  select count(*)::int from public.booking_email_details('70000000-0000-4000-8000-000000000001')
$$;

grant execute on all functions in schema tests to anon, authenticated, service_role;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin@a.test'),
  ('00000000-0000-4000-8000-0000000000a2', 'frontdesk@a.test'),
  ('00000000-0000-4000-8000-0000000000a3', 'maintenance@a.test'),
  ('00000000-0000-4000-8000-0000000000a4', 'manager@a.test'),
  ('00000000-0000-4000-8000-0000000000a5', 'reviewer@a.test'),
  ('00000000-0000-4000-8000-0000000000b1', 'admin@b.test'),
  ('00000000-0000-4000-8000-0000000000d1', 'student1@example.com'),
  ('00000000-0000-4000-8000-0000000000d2', 'student2@example.com'),
  ('00000000-0000-4000-8000-0000000000e1', 'platform@adestay.test');

insert into public.tenants (id, slug, name, reference_prefix, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'hostel-a', 'Hostel A', 'HA', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'hostel-b', 'Hostel B', 'HB', 'active');

insert into public.tenant_profiles (tenant_id, display_name, contact_email, contact_phone, is_published) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Alder House', 'hello@alder.example.com', '+233241111111', true);

insert into public.permission_sets (id, tenant_id, key, name, permissions) values
  ('50000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'review_only', 'Review only', array['bookings.read', 'bookings.review']);

insert into public.tenant_memberships (tenant_id, user_id, role, permission_set_id, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a1', 'hostel_admin', null, 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a2', 'staff', (select id from public.permission_sets where key = 'front_desk' and is_system), 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a3', 'staff', (select id from public.permission_sets where key = 'maintenance' and is_system), 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a4', 'staff', (select id from public.permission_sets where key = 'manager' and is_system), 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a5', 'staff', '50000000-0000-4000-8000-000000000001', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-4000-8000-0000000000b1', 'hostel_admin', null, 'active');

insert into public.platform_admins (user_id) values ('00000000-0000-4000-8000-0000000000e1');
insert into public.platform_access_grants (platform_admin_user_id, tenant_id, reason, granted_at, expires_at) values
  ('00000000-0000-4000-8000-0000000000e1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Checking a booking question', now() - interval '5 minutes', now() + interval '1 hour');

insert into public.residents (id, tenant_id, user_id, full_name, email) values
  ('60000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000d1', 'Ama Mensah', 'student1@example.com'),
  ('60000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000d2', 'Kofi Owusu', 'student2@example.com');

insert into public.booking_periods (id, tenant_id, name, kind, starts_on, ends_on, status) values
  ('10000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2027/28 Year', 'academic_year', '2027-09-01', '2028-07-31', 'open');
insert into public.room_types (id, tenant_id, name, slug, occupancy, is_published) values
  ('20000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2 in a room', 'two', 2, true);

insert into public.booking_requests (id, tenant_id, reference, resident_id, booking_period_id, room_type_id, status,
                                     quoted_amount_minor, quoted_deposit_minor, decided_at, idempotency_key) values
  ('70000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'HA-7K3Q9P', '60000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'approved', 450000, 100000, now(), gen_random_uuid());
insert into public.reservations (tenant_id, booking_request_id, room_type_id, booking_period_id, status, hold_expires_at) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '70000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000001', 'held', '2027-06-01 12:00:00+00');

select ok(not has_function_privilege('anon', 'public.booking_email_details(uuid)', 'execute'), 'visitors cannot read email details');
select ok(not has_function_privilege('authenticated', 'public.booking_email_details_for_job(uuid)', 'execute'), 'signed-in users cannot use the job function');
select ok(has_function_privilege('service_role', 'public.booking_email_details_for_job(uuid)', 'execute'), 'the server job can');
select ok(not has_function_privilege('authenticated', 'app.booking_email_details(uuid)', 'execute'), 'the internal function is closed');

select tests.as_user('00000000-0000-4000-8000-0000000000d1');
select is(tests.visible(), 1, 'a student can read their own booking''s email details');
select is((select recipient_email || '|' || student_name || '|' || hostel_name || '|' || booking_reference || '|' || quoted_deposit_minor
           from public.booking_email_details('70000000-0000-4000-8000-000000000001')),
  'student1@example.com|Ama Mensah|Alder House|HA-7K3Q9P|100000', 'the details are correct');
select is((select hold_expires_at from public.booking_email_details('70000000-0000-4000-8000-000000000001')),
  '2027-06-01 12:00:00+00'::timestamptz, 'the hold time is included');
select tests.as_owner();
select tests.as_user('00000000-0000-4000-8000-0000000000d2');
select is(tests.visible(), 0, 'another student cannot');
select tests.as_owner();
select tests.as_user('00000000-0000-4000-8000-0000000000a4');
select is(tests.visible(), 1, 'a manager (bookings.read and residents.read) can');
select tests.as_owner();
select tests.as_user('00000000-0000-4000-8000-0000000000a5');
select is(tests.visible(), 0, 'a reviewer without residents.read cannot get the student''s contact details');
select tests.as_owner();
select tests.as_user('00000000-0000-4000-8000-0000000000a3');
select is(tests.visible(), 0, 'maintenance staff cannot');
select tests.as_owner();
select tests.as_user('00000000-0000-4000-8000-0000000000a1', 'aal1');
select is(tests.visible(), 0, 'a hostel admin without MFA cannot');
select tests.as_owner();
select tests.as_user('00000000-0000-4000-8000-0000000000a1', 'aal2');
select is(tests.visible(), 1, 'a hostel admin with MFA can');
select tests.as_owner();
select tests.as_user('00000000-0000-4000-8000-0000000000b1', 'aal2');
select is(tests.visible(), 0, 'another hostel''s admin cannot');
select tests.as_owner();
select tests.as_user('00000000-0000-4000-8000-0000000000e1', 'aal2');
select is(tests.visible(), 0, 'break-glass does not give access to email details');
select tests.as_owner();

set local role service_role;
select is((select count(*)::int from public.booking_email_details_for_job('70000000-0000-4000-8000-000000000001')), 1, 'the expiry job can read the details');
select throws_ok($$select * from app.booking_email_details('70000000-0000-4000-8000-000000000001')$$, '42501', null, 'the job still cannot call the internal function');
reset role;

select * from finish();
rollback;
