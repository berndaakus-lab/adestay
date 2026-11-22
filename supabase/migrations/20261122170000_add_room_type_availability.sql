-- Phase 3, task 3. Availability: sellable beds minus live reservations, and the public indicator.
-- Design: docs/BOOKING_AND_PAYMENT_FLOWS.md §3 (capacity rule, indicator); docs/RBAC_MATRIX.md §4;
--         docs/adr/0003-booking-concurrency.md. Decisions D-4 and "busiest day" (product owner, in
--         chat, 2026-11-22).
--
-- Periods may overlap (an academic year and its semesters), so a reservation in one period uses
-- capacity in every period it overlaps. Reserved beds = the highest number of live reservations on
-- any single day of the period. Two semesters that do not overlap can therefore share a bed, and
-- neither can be sold on top of a full academic year.
--
-- Live = confirmed, fulfilled, or held and not yet past hold_expires_at. An overdue hold stops
-- counting at once, so capacity does not depend on when the expiry job last ran.

create function app.room_type_availability(p_tenant_id uuid, p_booking_period_id uuid default null)
returns table (
  room_type_id uuid,
  booking_period_id uuid,
  sellable_beds integer,
  reserved_beds integer,   -- busiest day of the period
  remaining_beds integer,
  overcommitted boolean    -- blocks or maintenance left fewer beds than live reservations
)
language sql
stable
security definer
set search_path = ''
as $$
  with capacity as (
    select c.room_type_id, c.booking_period_id, c.sellable_beds, bp.stay
    from app.room_type_capacity(p_tenant_id, p_booking_period_id) c
    join public.booking_periods bp on bp.tenant_id = p_tenant_id and bp.id = c.booking_period_id
  ),
  live as (
    select r.room_type_id, bp.stay
    from public.reservations r
    join public.booking_periods bp on bp.tenant_id = r.tenant_id and bp.id = r.booking_period_id
    where r.tenant_id = p_tenant_id
      and (r.status in ('confirmed', 'fulfilled') or (r.status = 'held' and r.hold_expires_at > now()))
  )
  select c.room_type_id,
         c.booking_period_id,
         c.sellable_beds,
         coalesce(peak.beds, 0)::integer,
         greatest(c.sellable_beds - coalesce(peak.beds, 0), 0)::integer,
         coalesce(peak.beds, 0) > c.sellable_beds
  from capacity c
  left join lateral (
    -- The count can only rise on the first day of the period or the day a reservation starts.
    select max((
      select count(*) from live l2
      where l2.room_type_id = c.room_type_id and l2.stay @> d.day
    )) as beds
    from (
      select lower(c.stay) as day
      union
      select greatest(lower(l.stay), lower(c.stay))
      from live l
      where l.room_type_id = c.room_type_id and l.stay && c.stay
    ) d
  ) peak on true
$$;

-- Staff: exact figures, for those who work with inventory or bookings.
create function public.room_type_availability(p_tenant_id uuid, p_booking_period_id uuid default null)
returns table (
  room_type_id uuid,
  booking_period_id uuid,
  sellable_beds integer,
  reserved_beds integer,
  remaining_beds integer,
  overcommitted boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.*
  from app.room_type_availability(p_tenant_id, p_booking_period_id) a
  where app.has_permission(p_tenant_id, 'inventory.read')
     or app.has_permission(p_tenant_id, 'inventory.manage')
     or app.has_permission(p_tenant_id, 'bookings.read')
     or app.has_break_glass(p_tenant_id)
$$;

-- Public: never exact counts (D-4). Lists only what a student could submit a request for now.
create function public.room_type_availability_indicators(p_tenant_id uuid, p_booking_period_id uuid default null)
returns table (room_type_id uuid, booking_period_id uuid, availability text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.room_type_id,
         a.booking_period_id,
         case when a.remaining_beds = 0 then 'full'
              when a.remaining_beds <= 3 then 'limited'
              else 'available' end
  from app.room_type_availability(p_tenant_id, p_booking_period_id) a
  join public.tenants t on t.id = p_tenant_id and t.status = 'active'
  join public.tenant_profiles tp on tp.tenant_id = t.id and tp.is_published
  join public.room_types rt on rt.tenant_id = t.id and rt.id = a.room_type_id and rt.is_published
  join public.booking_periods bp on bp.tenant_id = t.id and bp.id = a.booking_period_id
    and bp.status = 'open'
    and (bp.booking_opens_at is null or bp.booking_opens_at <= now())
    and (bp.booking_closes_at is null or bp.booking_closes_at > now())
  join public.room_type_prices pr on pr.tenant_id = t.id
    and pr.room_type_id = a.room_type_id and pr.booking_period_id = a.booking_period_id
$$;

revoke execute on function public.room_type_availability(uuid, uuid) from public, anon;
grant execute on function public.room_type_availability(uuid, uuid) to authenticated, service_role;
revoke execute on function public.room_type_availability_indicators(uuid, uuid) from public;
grant execute on function public.room_type_availability_indicators(uuid, uuid) to anon, authenticated, service_role;

revoke execute on all functions in schema app from public;
