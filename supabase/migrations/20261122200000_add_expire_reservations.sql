-- Phase 3, task 6. Background expiry of overdue holds and of requests whose booking window closed.
-- Design: docs/BOOKING_AND_PAYMENT_FLOWS.md §2.1, §2.2, §3 (expiry action), §4;
--         docs/adr/0003-booking-concurrency.md (decision 4, lock order); SYSTEM_ARCHITECTURE §6.
--
-- Called by the cron route (task 13) with the service role; no user can run it. It is safe to run
-- repeatedly and in parallel: rows locked by a staff action are skipped and picked up next run.
--
-- Lock order stays request -> reservation, the same as every staff action, so it cannot deadlock
-- with them. The clock is a parameter of the internal function so tests can control it.
--
-- Hostels that are not active are skipped: a student should not lose a hold while the hostel's
-- staff are locked out by a suspension.
-- Added later: unpaid invoice void (5a), allocation cancel (4), in-flight payment grace (5b).

create function app.expire_reservations(p_now timestamptz, p_limit integer default 200)
returns table (
  expired_reservations integer,
  closed_requests integer,
  has_more boolean,
  lapsed_request_ids uuid[],  -- for the student emails (task 13)
  closed_request_ids uuid[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_due record;
  v_lapsed uuid[] := '{}';
  v_closed uuid[] := '{}';
  v_seen_holds integer := 0;
  v_seen_requests integer := 0;
begin
  if p_now is null or p_limit is null or p_limit not between 1 and 1000 then
    raise exception 'invalid expiry arguments' using errcode = '22023';
  end if;

  for v_due in
    select r.id, r.tenant_id, r.booking_request_id, r.hold_expires_at
    from public.reservations r
    join public.tenants t on t.id = r.tenant_id and t.status = 'active'
    where r.status = 'held' and r.hold_expires_at <= p_now
    order by r.hold_expires_at, r.id
    limit p_limit
  loop
    v_seen_holds := v_seen_holds + 1;

    perform 1 from public.booking_requests br
    where br.tenant_id = v_due.tenant_id and br.id = v_due.booking_request_id
    for update skip locked;
    if not found then
      continue;
    end if;

    -- Re-check under the lock: staff may have extended or confirmed it a moment ago.
    perform 1 from public.reservations r
    where r.tenant_id = v_due.tenant_id and r.id = v_due.id
      and r.status = 'held' and r.hold_expires_at <= p_now
    for update skip locked;
    if not found then
      continue;
    end if;

    update public.reservations r
    set status = 'expired', ended_at = p_now, end_reason = 'Hold expired'
    where r.tenant_id = v_due.tenant_id and r.id = v_due.id;

    update public.booking_requests br
    set status = 'lapsed'
    where br.tenant_id = v_due.tenant_id and br.id = v_due.booking_request_id and br.status = 'approved';

    perform app.write_audit(v_due.tenant_id, 'reservation.expired', 'reservations', v_due.id::text,
      jsonb_build_object('status', 'held', 'hold_expires_at', v_due.hold_expires_at),
      jsonb_build_object('status', 'expired', 'request_status', 'lapsed'), 'Hold expired', 'cron');

    v_lapsed := v_lapsed || v_due.booking_request_id;
  end loop;

  -- The state diagram expires submitted and waitlisted requests; one under review stays with staff.
  for v_due in
    select br.id, br.tenant_id, br.status
    from public.booking_requests br
    join public.booking_periods bp on bp.tenant_id = br.tenant_id and bp.id = br.booking_period_id
    join public.tenants t on t.id = br.tenant_id and t.status = 'active'
    where br.status in ('submitted', 'waitlisted')
      and bp.booking_closes_at is not null and bp.booking_closes_at <= p_now
    order by bp.booking_closes_at, br.id
    limit p_limit
    for update of br skip locked
  loop
    v_seen_requests := v_seen_requests + 1;

    update public.booking_requests br
    set status = 'expired'
    where br.tenant_id = v_due.tenant_id and br.id = v_due.id;

    perform app.write_audit(v_due.tenant_id, 'booking.expired', 'booking_requests', v_due.id::text,
      jsonb_build_object('status', v_due.status), jsonb_build_object('status', 'expired'),
      'Booking window closed', 'cron');

    v_closed := v_closed || v_due.id;
  end loop;

  return query select cardinality(v_lapsed), cardinality(v_closed),
    v_seen_holds = p_limit or v_seen_requests = p_limit, v_lapsed, v_closed;
end;
$$;

create function public.expire_reservations(p_limit integer default 200)
returns table (
  expired_reservations integer,
  closed_requests integer,
  has_more boolean,
  lapsed_request_ids uuid[],
  closed_request_ids uuid[]
)
language sql
security definer
set search_path = ''
as $$
  select * from app.expire_reservations(now(), p_limit)
$$;

revoke execute on function public.expire_reservations(integer) from public, anon, authenticated;
grant execute on function public.expire_reservations(integer) to service_role;

revoke execute on all functions in schema app from public;
