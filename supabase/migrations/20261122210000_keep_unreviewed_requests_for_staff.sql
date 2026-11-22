-- Phase 3, task 6 follow-up. Product owner decision, in chat, 2026-11-22: when a booking window
-- closes, unreviewed requests stay in the staff queue instead of expiring automatically.
-- Staff close them by approving, waitlisting or rejecting. The job now only ends overdue holds.
-- Design: docs/BOOKING_AND_PAYMENT_FLOWS.md §2.1, §2.2, §3, §4; docs/adr/0003-booking-concurrency.md.
--
-- The return type changes, so the functions are dropped and recreated. Nothing depends on them yet.

drop function public.expire_reservations(integer);
drop function app.expire_reservations(timestamptz, integer);

create function app.expire_reservations(p_now timestamptz, p_limit integer default 200)
returns table (
  expired_reservations integer,
  has_more boolean,
  lapsed_request_ids uuid[]  -- for the student emails (task 13)
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_due record;
  v_lapsed uuid[] := '{}';
  v_seen integer := 0;
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
    v_seen := v_seen + 1;

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

  return query select cardinality(v_lapsed), v_seen = p_limit, v_lapsed;
end;
$$;

create function public.expire_reservations(p_limit integer default 200)
returns table (
  expired_reservations integer,
  has_more boolean,
  lapsed_request_ids uuid[]
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
