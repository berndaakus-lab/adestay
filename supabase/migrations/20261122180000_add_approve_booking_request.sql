-- Phase 3, task 4. Staff approve a booking request, which holds capacity at room-type level.
-- Design: docs/adr/0003-booking-concurrency.md; docs/BOOKING_AND_PAYMENT_FLOWS.md §2.1, §2.2, §3,
--         §4, §5 (scenario 1); docs/DATABASE_DESIGN.md §5; docs/RBAC_MATRIX.md (bookings.review).
--
-- Lock order: request, then room type. The room-type lock serialises approvals, and availability
-- is read in a later statement, so each approval sees the holds committed by the one before it.
-- Invoices are added in Phase 5a and the student's email in task 9.
--
-- Errors: 42501 not allowed (also unknown ids), 55000 the request cannot be approved in its current
-- state, AS409 no capacity.

create function public.approve_booking_request(p_request_id uuid)
returns table (approved_request_id uuid, new_reservation_id uuid, hold_until timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_tenant uuid;
  v_room_type uuid;
  v_period uuid;
  v_resident uuid;
  v_status text;
  v_reference text;
  v_resident_status text;
  v_period_status text;
  v_period_ends date;
  v_hold_hours integer;
  v_remaining integer;
  v_until timestamptz;
  v_reservation uuid;
begin
  if v_user is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  -- Check permission before taking any lock, so an outsider cannot hold up a hostel's rows.
  select br.tenant_id into v_tenant from public.booking_requests br where br.id = p_request_id;
  if v_tenant is null or not app.has_permission(v_tenant, 'bookings.review') then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select br.room_type_id, br.booking_period_id, br.resident_id, br.status, br.reference
    into v_room_type, v_period, v_resident, v_status, v_reference
  from public.booking_requests br
  where br.tenant_id = v_tenant and br.id = p_request_id
  for update;

  if v_status not in ('submitted', 'under_review', 'waitlisted') then
    raise exception 'this request can no longer be approved' using errcode = '55000';
  end if;

  select r.status into v_resident_status
  from public.residents r where r.tenant_id = v_tenant and r.id = v_resident;
  if v_resident_status = 'blocked' then
    raise exception 'this student is blocked' using errcode = '55000';
  end if;

  select bp.status, bp.ends_on into v_period_status, v_period_ends
  from public.booking_periods bp where bp.tenant_id = v_tenant and bp.id = v_period;
  if v_period_status = 'archived' or v_period_ends < current_date then
    raise exception 'this period has ended' using errcode = '55000';
  end if;

  perform 1 from public.room_types rt where rt.tenant_id = v_tenant and rt.id = v_room_type for update;

  select a.remaining_beds into v_remaining
  from app.room_type_availability(v_tenant, v_period) a
  where a.room_type_id = v_room_type;
  if coalesce(v_remaining, 0) < 1 then
    raise exception 'no capacity' using errcode = 'AS409';
  end if;

  select s.hold_duration_hours into v_hold_hours from public.tenant_settings s where s.tenant_id = v_tenant;
  if v_hold_hours is null then
    raise exception 'booking rules are missing' using errcode = '55000';
  end if;
  v_until := now() + make_interval(hours => v_hold_hours);

  insert into public.reservations (tenant_id, booking_request_id, room_type_id, booking_period_id, status, hold_expires_at)
  values (v_tenant, p_request_id, v_room_type, v_period, 'held', v_until)
  returning id into v_reservation;

  update public.booking_requests br
  set status = 'approved', reviewed_by = v_user, decided_at = now()
  where br.tenant_id = v_tenant and br.id = p_request_id;

  perform app.write_audit(v_tenant, 'booking.approved', 'booking_requests', p_request_id::text,
    jsonb_build_object('status', v_status),
    jsonb_build_object('status', 'approved', 'reference', v_reference, 'reservation_id', v_reservation, 'hold_expires_at', v_until));

  return query select p_request_id, v_reservation, v_until;
end;
$$;

revoke execute on function public.approve_booking_request(uuid) from public, anon;
grant execute on function public.approve_booking_request(uuid) to authenticated;

revoke execute on all functions in schema app from public;
