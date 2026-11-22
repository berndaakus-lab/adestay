-- Phase 3, task 5. Staff decisions: start review, reject, waitlist, cancel, extend a hold, confirm.
-- Design: docs/BOOKING_AND_PAYMENT_FLOWS.md §2.1, §2.2, §3, §4, §7; docs/RBAC_MATRIX.md §2, §4;
--         docs/adr/0003-booking-concurrency.md. Staff confirmation until payments exist: product
--         owner, in chat, 2026-11-22.
--
-- Transitions follow the state diagrams exactly. In particular a request must be under review or
-- waitlisted before it can be rejected.
-- Lock order: request -> room type -> reservation (ADR-0003).
--
-- Errors: 42501 not allowed (also unknown ids), 22023 invalid input, 55000 wrong state,
-- AS409 no capacity.

create function app.clean_reason(p_reason text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_reason text := nullif(btrim(p_reason), '');
begin
  if v_reason is null or char_length(v_reason) > 1000 then
    raise exception 'enter a reason of up to 1000 characters' using errcode = '22023';
  end if;
  return v_reason;
end;
$$;

-- Checks the permission first, so a caller without it never holds a lock on the row.
create function app.lock_request_for_staff(p_request_id uuid, p_permission text)
returns public.booking_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_request public.booking_requests%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select br.tenant_id into v_tenant from public.booking_requests br where br.id = p_request_id;
  if v_tenant is null or not app.has_permission(v_tenant, p_permission) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_request from public.booking_requests br
  where br.tenant_id = v_tenant and br.id = p_request_id
  for update;
  return v_request;
end;
$$;

-- Locks request, room type and reservation in the fixed order and returns the reservation.
create function app.lock_reservation_for_staff(p_reservation_id uuid, p_permission text)
returns public.reservations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_request uuid;
  v_room_type uuid;
  v_reservation public.reservations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select r.tenant_id, r.booking_request_id, r.room_type_id into v_tenant, v_request, v_room_type
  from public.reservations r where r.id = p_reservation_id;
  if v_tenant is null or not app.has_permission(v_tenant, p_permission) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  perform 1 from public.booking_requests br where br.tenant_id = v_tenant and br.id = v_request for update;
  perform 1 from public.room_types rt where rt.tenant_id = v_tenant and rt.id = v_room_type for update;
  select * into v_reservation from public.reservations r
  where r.tenant_id = v_tenant and r.id = p_reservation_id
  for update;
  return v_reservation;
end;
$$;

-- An overdue hold no longer counts, so its bed may have gone to someone else. Call with the
-- room-type lock held.
create function app.require_capacity_if_overdue(p_reservation public.reservations)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_remaining integer;
begin
  if p_reservation.hold_expires_at > now() then
    return;
  end if;
  select a.remaining_beds into v_remaining
  from app.room_type_availability(p_reservation.tenant_id, p_reservation.booking_period_id) a
  where a.room_type_id = p_reservation.room_type_id;
  if coalesce(v_remaining, 0) < 1 then
    raise exception 'no capacity' using errcode = 'AS409';
  end if;
end;
$$;

create function public.start_booking_review(p_request_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.booking_requests%rowtype := app.lock_request_for_staff(p_request_id, 'bookings.review');
begin
  -- Two staff opening the same request is normal; the first reviewer stays recorded.
  if v_request.status = 'under_review' then
    return v_request.status;
  end if;
  if v_request.status <> 'submitted' then
    raise exception 'this request is not waiting for review' using errcode = '55000';
  end if;
  update public.booking_requests br set status = 'under_review', reviewed_by = auth.uid()
  where br.tenant_id = v_request.tenant_id and br.id = p_request_id;
  perform app.write_audit(v_request.tenant_id, 'booking.review_started', 'booking_requests', p_request_id::text,
    jsonb_build_object('status', v_request.status), jsonb_build_object('status', 'under_review'));
  return 'under_review';
end;
$$;

create function public.reject_booking_request(p_request_id uuid, p_reason text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.booking_requests%rowtype := app.lock_request_for_staff(p_request_id, 'bookings.review');
  v_reason text := app.clean_reason(p_reason);
begin
  if v_request.status not in ('under_review', 'waitlisted') then
    raise exception 'this request cannot be rejected now' using errcode = '55000';
  end if;
  update public.booking_requests br
  set status = 'rejected', reviewed_by = auth.uid(), decided_at = now(), decision_reason = v_reason
  where br.tenant_id = v_request.tenant_id and br.id = p_request_id;
  perform app.write_audit(v_request.tenant_id, 'booking.rejected', 'booking_requests', p_request_id::text,
    jsonb_build_object('status', v_request.status), jsonb_build_object('status', 'rejected'), v_reason);
  return 'rejected';
end;
$$;

create function public.waitlist_booking_request(p_request_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.booking_requests%rowtype := app.lock_request_for_staff(p_request_id, 'bookings.review');
begin
  if v_request.status not in ('submitted', 'under_review') then
    raise exception 'this request cannot be waitlisted now' using errcode = '55000';
  end if;
  update public.booking_requests br set status = 'waitlisted', reviewed_by = auth.uid()
  where br.tenant_id = v_request.tenant_id and br.id = p_request_id;
  perform app.write_audit(v_request.tenant_id, 'booking.waitlisted', 'booking_requests', p_request_id::text,
    jsonb_build_object('status', v_request.status), jsonb_build_object('status', 'waitlisted'));
  return 'waitlisted';
end;
$$;

-- Hostel cancellation of an approved booking. Students cancel in Phase 4; refund evaluation and
-- bed allocations join this function in Phases 5a and 4.
create function public.cancel_booking_request(p_request_id uuid, p_reason text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.booking_requests%rowtype := app.lock_request_for_staff(p_request_id, 'bookings.cancel');
  v_reason text := app.clean_reason(p_reason);
  v_reservation public.reservations%rowtype;
begin
  if v_request.status <> 'approved' then
    raise exception 'only an approved booking can be cancelled' using errcode = '55000';
  end if;
  select * into v_reservation from public.reservations r
  where r.tenant_id = v_request.tenant_id and r.booking_request_id = p_request_id
  for update;
  if v_reservation.status is null or v_reservation.status not in ('held', 'confirmed') then
    raise exception 'this booking can no longer be cancelled' using errcode = '55000';
  end if;
  update public.reservations r
  set status = 'cancelled', ended_at = now(), end_reason = v_reason
  where r.tenant_id = v_request.tenant_id and r.id = v_reservation.id;
  update public.booking_requests br
  set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = v_reason
  where br.tenant_id = v_request.tenant_id and br.id = p_request_id;
  perform app.write_audit(v_request.tenant_id, 'booking.cancelled', 'booking_requests', p_request_id::text,
    jsonb_build_object('status', v_request.status, 'reservation_status', v_reservation.status),
    jsonb_build_object('status', 'cancelled', 'reservation_status', 'cancelled'), v_reason);
  return 'cancelled';
end;
$$;

create function public.extend_hold(p_reservation_id uuid, p_hours integer, p_reason text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation public.reservations%rowtype := app.lock_reservation_for_staff(p_reservation_id, 'bookings.review');
  v_reason text := app.clean_reason(p_reason);
  v_max_hours integer;
  v_max_extensions integer;
  v_until timestamptz;
begin
  if v_reservation.status <> 'held' then
    raise exception 'only a held reservation can be extended' using errcode = '55000';
  end if;
  select s.hold_duration_hours, s.hold_extension_max into v_max_hours, v_max_extensions
  from public.tenant_settings s where s.tenant_id = v_reservation.tenant_id;
  if v_max_hours is null then
    raise exception 'booking rules are missing' using errcode = '55000';
  end if;
  if p_hours is null or p_hours < 1 or p_hours > v_max_hours then
    raise exception 'an extension can be at most % hours', v_max_hours using errcode = '22023';
  end if;
  if v_reservation.extensions_used >= v_max_extensions then
    raise exception 'this hold has used all its extensions' using errcode = '55000';
  end if;
  perform app.require_capacity_if_overdue(v_reservation);

  -- An overdue hold restarts from now, otherwise the extension could already be in the past.
  v_until := greatest(v_reservation.hold_expires_at, now()) + make_interval(hours => p_hours);
  update public.reservations r
  set hold_expires_at = v_until, extensions_used = r.extensions_used + 1
  where r.tenant_id = v_reservation.tenant_id and r.id = p_reservation_id;
  perform app.write_audit(v_reservation.tenant_id, 'reservation.extended', 'reservations', p_reservation_id::text,
    jsonb_build_object('hold_expires_at', v_reservation.hold_expires_at, 'extensions_used', v_reservation.extensions_used),
    jsonb_build_object('hold_expires_at', v_until, 'extensions_used', v_reservation.extensions_used + 1), v_reason);
  return v_until;
end;
$$;

create function public.confirm_reservation(p_reservation_id uuid, p_reason text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation public.reservations%rowtype := app.lock_reservation_for_staff(p_reservation_id, 'bookings.review');
  v_reason text := app.clean_reason(p_reason);
begin
  if v_reservation.status <> 'held' then
    raise exception 'only a held reservation can be confirmed' using errcode = '55000';
  end if;
  perform app.require_capacity_if_overdue(v_reservation);
  update public.reservations r
  set status = 'confirmed', confirmed_at = now()
  where r.tenant_id = v_reservation.tenant_id and r.id = p_reservation_id;
  perform app.write_audit(v_reservation.tenant_id, 'reservation.confirmed', 'reservations', p_reservation_id::text,
    jsonb_build_object('status', 'held'), jsonb_build_object('status', 'confirmed'), v_reason);
  return 'confirmed';
end;
$$;

revoke execute on function public.start_booking_review(uuid) from public, anon;
revoke execute on function public.reject_booking_request(uuid, text) from public, anon;
revoke execute on function public.waitlist_booking_request(uuid) from public, anon;
revoke execute on function public.cancel_booking_request(uuid, text) from public, anon;
revoke execute on function public.extend_hold(uuid, integer, text) from public, anon;
revoke execute on function public.confirm_reservation(uuid, text) from public, anon;
grant execute on function public.start_booking_review(uuid) to authenticated;
grant execute on function public.reject_booking_request(uuid, text) to authenticated;
grant execute on function public.waitlist_booking_request(uuid) to authenticated;
grant execute on function public.cancel_booking_request(uuid, text) to authenticated;
grant execute on function public.extend_hold(uuid, integer, text) to authenticated;
grant execute on function public.confirm_reservation(uuid, text) to authenticated;

revoke execute on all functions in schema app from public;
