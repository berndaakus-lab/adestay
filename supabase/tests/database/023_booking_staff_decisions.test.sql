-- Phase 3, task 5. Staff decisions: permissions, transitions, reasons, holds and audit
-- (docs/BOOKING_AND_PAYMENT_FLOWS.md §2, §3, §7).
begin;
select plan(56);

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

-- Request n (and its reservation when a reservation status is given).
create function tests.booking(p_n integer, p_status text, p_reservation text default null,
                              p_room text default 'big', p_expires timestamptz default now() + interval '120 hours')
returns void
language plpgsql as $$
declare
  v_suffix text := lpad(p_n::text, 2, '0');
  v_request uuid := ('70000000-0000-4000-8000-0000000000' || v_suffix)::uuid;
  v_resident uuid := ('60000000-0000-4000-8000-0000000000' || v_suffix)::uuid;
  v_room uuid := case p_room when 'big' then '20000000-0000-4000-8000-000000000001'::uuid else '20000000-0000-4000-8000-000000000002'::uuid end;
begin
  insert into public.residents (id, tenant_id, user_id, full_name, email)
  values (v_resident, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          case when p_n = 5 then '00000000-0000-4000-8000-0000000000d1'::uuid end,
          'Student ' || p_n, 'student' || p_n || '@example.com');
  insert into public.booking_requests (id, tenant_id, reference, resident_id, booking_period_id, room_type_id, status,
                                       quoted_amount_minor, decided_at, decision_reason, idempotency_key)
  values (v_request, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'HA-AAAA' || v_suffix, v_resident,
          '10000000-0000-4000-8000-000000000001', v_room, p_status, 1000,
          case when p_status in ('approved', 'rejected') then now() end,
          case when p_status = 'rejected' then 'No space' end, gen_random_uuid());
  if p_reservation is not null then
    insert into public.reservations (id, tenant_id, booking_request_id, room_type_id, booking_period_id, status, hold_expires_at, confirmed_at)
    values (('90000000-0000-4000-8000-0000000000' || v_suffix)::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_request, v_room,
            '10000000-0000-4000-8000-000000000001', p_reservation,
            case when p_reservation = 'held' then p_expires end,
            case when p_reservation in ('confirmed', 'fulfilled') then now() end);
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Fixtures: "big" has 12 beds, "small" has 1
-- ---------------------------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a2', 'frontdesk@a.test'),
  ('00000000-0000-4000-8000-0000000000a3', 'reviewer@a.test'),
  ('00000000-0000-4000-8000-0000000000a4', 'manager@a.test'),
  ('00000000-0000-4000-8000-0000000000b1', 'admin@b.test'),
  ('00000000-0000-4000-8000-0000000000d1', 'student@a.test'),
  ('00000000-0000-4000-8000-0000000000e1', 'platform@adestay.test');

insert into public.tenants (id, slug, name, reference_prefix, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'hostel-a', 'Hostel A', 'HA', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'hostel-b', 'Hostel B', 'HB', 'active');

insert into public.tenant_settings (tenant_id, hold_duration_hours, hold_extension_max) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 120, 1),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 120, 1);

insert into public.permission_sets (id, tenant_id, key, name, permissions) values
  ('50000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'review_only', 'Review only', array['bookings.read', 'bookings.review']);

insert into public.tenant_memberships (tenant_id, user_id, role, permission_set_id, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a2', 'staff',
     (select id from public.permission_sets where key = 'front_desk' and is_system), 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a3', 'staff', '50000000-0000-4000-8000-000000000001', 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a4', 'staff',
     (select id from public.permission_sets where key = 'manager' and is_system), 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-4000-8000-0000000000b1', 'hostel_admin', null, 'active');

insert into public.platform_admins (user_id) values ('00000000-0000-4000-8000-0000000000e1');
insert into public.platform_access_grants (platform_admin_user_id, tenant_id, reason, granted_at, expires_at) values
  ('00000000-0000-4000-8000-0000000000e1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Checking a booking question',
   now() - interval '5 minutes', now() + interval '1 hour');

insert into public.booking_periods (id, tenant_id, name, kind, starts_on, ends_on, status) values
  ('10000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Year', 'academic_year', '2027-09-01', '2028-07-31', 'open');

insert into public.room_types (id, tenant_id, name, slug, occupancy, is_published) values
  ('20000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Big', 'big', 12, true),
  ('20000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Small', 'small', 1, true);

insert into public.rooms (id, tenant_id, room_type_id, label) values
  ('30000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-000000000001', 'B-1'),
  ('30000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-000000000002', 'S-1');

insert into public.beds (tenant_id, room_id, label)
select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '30000000-0000-4000-8000-000000000001', 'B' || n from generate_series(1, 12) n;
insert into public.beds (tenant_id, room_id, label) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '30000000-0000-4000-8000-000000000002', 'A');

select tests.booking(1, 'submitted');
select tests.booking(2, 'submitted');
select tests.booking(3, 'under_review');
select tests.booking(4, 'rejected');
select tests.booking(5, 'approved', 'held');
select tests.booking(6, 'approved', 'confirmed');
select tests.booking(7, 'approved', 'fulfilled');
select tests.booking(8, 'approved', 'held');
select tests.booking(10, 'approved', 'held');
select tests.booking(11, 'approved', 'held', 'big', now() - interval '1 hour');
select tests.booking(12, 'approved', 'held', 'small', now() - interval '1 hour');
select tests.booking(13, 'approved', 'held', 'small');
select tests.booking(14, 'approved', 'held');

-- ---------------------------------------------------------------------------------------------
-- Who may act
-- ---------------------------------------------------------------------------------------------
select is((select count(*)::int from unnest(array[
    'public.start_booking_review(uuid)', 'public.reject_booking_request(uuid, text)', 'public.waitlist_booking_request(uuid)',
    'public.cancel_booking_request(uuid, text)', 'public.extend_hold(uuid, integer, text)', 'public.confirm_reservation(uuid, text)']) f
   where has_function_privilege('anon', f, 'execute')), 0, 'visitors can call none of the staff decisions');
select is((select count(*)::int from unnest(array[
    'public.start_booking_review(uuid)', 'public.reject_booking_request(uuid, text)', 'public.waitlist_booking_request(uuid)',
    'public.cancel_booking_request(uuid, text)', 'public.extend_hold(uuid, integer, text)', 'public.confirm_reservation(uuid, text)']) f
   where has_function_privilege('authenticated', f, 'execute')), 6, 'signed-in users can reach them; each checks its own permission');

select tests.as_user('00000000-0000-4000-8000-0000000000a2');
select throws_ok($$select public.start_booking_review('70000000-0000-4000-8000-000000000001')$$, '42501', null, 'front desk cannot start a review');
select throws_ok($$select public.reject_booking_request('70000000-0000-4000-8000-000000000003', 'No')$$, '42501', null, 'front desk cannot reject');
select throws_ok($$select public.waitlist_booking_request('70000000-0000-4000-8000-000000000001')$$, '42501', null, 'front desk cannot waitlist');
select throws_ok($$select public.cancel_booking_request('70000000-0000-4000-8000-000000000005', 'No')$$, '42501', null, 'front desk cannot cancel');
select throws_ok($$select public.extend_hold('90000000-0000-4000-8000-000000000005', 24, 'More time')$$, '42501', null, 'front desk cannot extend a hold');
select throws_ok($$select public.confirm_reservation('90000000-0000-4000-8000-000000000005', 'Paid')$$, '42501', null, 'front desk cannot confirm');
select tests.as_owner();
select tests.as_user('00000000-0000-4000-8000-0000000000a3');
select throws_ok($$select public.cancel_booking_request('70000000-0000-4000-8000-000000000005', 'No')$$, '42501', null, 'bookings.review alone cannot cancel');
select tests.as_owner();
select tests.as_user('00000000-0000-4000-8000-0000000000b1', 'aal2');
select throws_ok($$select public.reject_booking_request('70000000-0000-4000-8000-000000000003', 'No')$$, '42501', null, 'another hostel''s admin cannot reject');
select tests.as_owner();
select tests.as_user('00000000-0000-4000-8000-0000000000d1');
select throws_ok($$select public.cancel_booking_request('70000000-0000-4000-8000-000000000005', 'Changed my mind')$$, '42501', null, 'a student cannot use the staff cancellation');
select tests.as_owner();
select tests.as_user('00000000-0000-4000-8000-0000000000e1', 'aal2');
select throws_ok($$select public.confirm_reservation('90000000-0000-4000-8000-000000000005', 'Paid')$$, '42501', null, 'break-glass is read-only and cannot confirm');
select tests.as_owner();

-- ---------------------------------------------------------------------------------------------
-- Review, reject, waitlist
-- ---------------------------------------------------------------------------------------------
select tests.as_user('00000000-0000-4000-8000-0000000000a4');
select throws_ok($$select public.confirm_reservation('90000000-0000-4000-8000-000000000999', 'Paid')$$, '42501', null, 'an unknown reservation looks the same as a forbidden one');
select is(public.start_booking_review('70000000-0000-4000-8000-000000000001'), 'under_review', 'a manager can start a review');
select is((select status from public.booking_requests where id = '70000000-0000-4000-8000-000000000001'), 'under_review', 'the request is under review');
select is(public.start_booking_review('70000000-0000-4000-8000-000000000001'), 'under_review', 'opening it a second time changes nothing');
select throws_ok($$select public.reject_booking_request('70000000-0000-4000-8000-000000000002', 'No')$$, '55000', null, 'a request must be reviewed before it is rejected');
select throws_ok($$select public.reject_booking_request('70000000-0000-4000-8000-000000000001', '   ')$$, '22023', null, 'a rejection needs a reason');
select is(public.reject_booking_request('70000000-0000-4000-8000-000000000001', 'Incomplete details'), 'rejected', 'a request under review can be rejected');
select is((select status from public.booking_requests where id = '70000000-0000-4000-8000-000000000001'), 'rejected', 'the request is rejected');
select is((select decision_reason from public.booking_requests where id = '70000000-0000-4000-8000-000000000001'), 'Incomplete details', 'the reason is stored');
select ok((select decided_at is not null from public.booking_requests where id = '70000000-0000-4000-8000-000000000001'), 'the decision time is stored');
select is(public.waitlist_booking_request('70000000-0000-4000-8000-000000000002'), 'waitlisted', 'a submitted request can be waitlisted');
select is((select status from public.booking_requests where id = '70000000-0000-4000-8000-000000000002'), 'waitlisted', 'the request is waitlisted');
select throws_ok($$select public.waitlist_booking_request('70000000-0000-4000-8000-000000000002')$$, '55000', null, 'a waitlisted request cannot be waitlisted again');
select is(public.waitlist_booking_request('70000000-0000-4000-8000-000000000003'), 'waitlisted', 'a request under review can be waitlisted');
select is(public.reject_booking_request('70000000-0000-4000-8000-000000000003', 'Period is full'), 'rejected', 'a waitlisted request can be rejected');
select throws_ok($$select public.waitlist_booking_request('70000000-0000-4000-8000-000000000004')$$, '55000', null, 'a rejected request cannot be waitlisted');
select throws_ok($$select public.start_booking_review('70000000-0000-4000-8000-000000000004')$$, '55000', null, 'a rejected request cannot be reopened');

-- ---------------------------------------------------------------------------------------------
-- Cancel
-- ---------------------------------------------------------------------------------------------
select throws_ok($$select public.cancel_booking_request('70000000-0000-4000-8000-000000000005', '')$$, '22023', null, 'a cancellation needs a reason');
select is(public.cancel_booking_request('70000000-0000-4000-8000-000000000005', 'Student left'), 'cancelled', 'a held booking can be cancelled');
select is((select status from public.reservations where id = '90000000-0000-4000-8000-000000000005'), 'cancelled', 'its reservation is cancelled');
select ok((select ended_at is not null and end_reason = 'Student left' from public.reservations where id = '90000000-0000-4000-8000-000000000005'), 'the end time and reason are stored');
select is(public.cancel_booking_request('70000000-0000-4000-8000-000000000006', 'Student left'), 'cancelled', 'a confirmed booking can be cancelled');
select throws_ok($$select public.cancel_booking_request('70000000-0000-4000-8000-000000000007', 'Too late')$$, '55000', null, 'a checked-in booking cannot be cancelled');
select throws_ok($$select public.cancel_booking_request('70000000-0000-4000-8000-000000000002', 'Not approved')$$, '55000', null, 'only an approved booking can be cancelled');

-- ---------------------------------------------------------------------------------------------
-- Extend and confirm
-- ---------------------------------------------------------------------------------------------
select throws_ok($$select public.extend_hold('90000000-0000-4000-8000-000000000008', 24, ' ')$$, '22023', null, 'an extension needs a reason');
select throws_ok($$select public.extend_hold('90000000-0000-4000-8000-000000000008', 121, 'More time')$$, '22023', null, 'an extension cannot exceed the hostel''s hold duration');
select throws_ok($$select public.extend_hold('90000000-0000-4000-8000-000000000008', 0, 'More time')$$, '22023', null, 'an extension must be at least an hour');
select is(public.extend_hold('90000000-0000-4000-8000-000000000008', 24, 'Parent paying Friday'), now() + interval '144 hours', 'an extension adds to the current expiry');
select is((select extensions_used::int from public.reservations where id = '90000000-0000-4000-8000-000000000008'), 1, 'the extension is counted');
select throws_ok($$select public.extend_hold('90000000-0000-4000-8000-000000000008', 24, 'Again')$$, '55000', null, 'the extension limit is enforced');
select throws_ok($$select public.confirm_reservation('90000000-0000-4000-8000-000000000010', '')$$, '22023', null, 'a confirmation needs a reason');
select is(public.confirm_reservation('90000000-0000-4000-8000-000000000010', 'Deposit received in cash'), 'confirmed', 'staff can confirm a hold');
select ok((select status = 'confirmed' and confirmed_at is not null from public.reservations where id = '90000000-0000-4000-8000-000000000010'), 'the confirmation is stored');
select throws_ok($$select public.confirm_reservation('90000000-0000-4000-8000-000000000010', 'Again')$$, '55000', null, 'a confirmed reservation cannot be confirmed again');
select throws_ok($$select public.extend_hold('90000000-0000-4000-8000-000000000010', 24, 'More time')$$, '55000', null, 'a confirmed reservation cannot be extended');

-- Overdue holds: the bed may have gone to someone else.
select is(public.extend_hold('90000000-0000-4000-8000-000000000011', 24, 'Late payment'), now() + interval '24 hours', 'an overdue hold restarts from now');
select throws_ok($$select public.extend_hold('90000000-0000-4000-8000-000000000012', 24, 'Late payment')$$, 'AS409', null, 'an overdue hold cannot be extended when its bed is taken');
select throws_ok($$select public.confirm_reservation('90000000-0000-4000-8000-000000000012', 'Late payment')$$, 'AS409', null, 'an overdue hold cannot be confirmed when its bed is taken');
select is(public.cancel_booking_request('70000000-0000-4000-8000-000000000013', 'Student left'), 'cancelled', 'the other booking gives up the bed');
select is(public.confirm_reservation('90000000-0000-4000-8000-000000000012', 'Late payment'), 'confirmed', 'the overdue hold can be confirmed once the bed is free');

-- ---------------------------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------------------------
select tests.as_owner();
select is((select reason from public.audit_logs where action = 'booking.rejected' and entity_id = '70000000-0000-4000-8000-000000000001'), 'Incomplete details', 'rejections are audited with the reason');
select is((select reason from public.audit_logs where action = 'booking.cancelled' and entity_id = '70000000-0000-4000-8000-000000000005'), 'Student left', 'cancellations are audited with the reason');
select is((select reason from public.audit_logs where action = 'reservation.extended' and entity_id = '90000000-0000-4000-8000-000000000008'), 'Parent paying Friday', 'extensions are audited with the reason');
select is((select reason from public.audit_logs where action = 'reservation.confirmed' and entity_id = '90000000-0000-4000-8000-000000000010'), 'Deposit received in cash', 'confirmations are audited with the reason');

select * from finish();
rollback;
