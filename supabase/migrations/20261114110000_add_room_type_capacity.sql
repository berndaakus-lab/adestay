-- Phase 2, task 2. Sellable capacity per room type × booking period.
-- Design: docs/DATABASE_DESIGN.md §4.3 (beds: "sellable beds"), docs/BOOKING_AND_PAYMENT_FLOWS.md §3
--         (capacity rule), docs/adr/0003-booking-concurrency.md; Phase 2 acceptance criterion 2.
--
-- Sellable beds of a room type for a period = beds with status 'active' in rooms with status 'active'
-- of that type, minus those beds that have a live (unreleased) block overlapping any day of the period.
-- A bed blocked for part of a period cannot be sold for that period.
--
-- app.room_type_capacity is the single implementation. It is SECURITY DEFINER with no API grants, so
-- the Phase 3 approval RPC can count every bed under its room-type lock. Staff read it through
-- public.room_type_capacity, which checks inventory permissions first.

create function app.room_type_capacity(p_tenant_id uuid, p_booking_period_id uuid default null)
returns table (
  room_type_id uuid,
  booking_period_id uuid,
  total_beds integer,          -- every non-retired bed in non-retired rooms of the type
  out_of_service_beds integer, -- bed or room in maintenance
  blocked_beds integer,        -- in service, but a live block overlaps the period
  sellable_beds integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with periods as (
    select bp.id, bp.stay
    from public.booking_periods bp
    where bp.tenant_id = p_tenant_id
      and bp.status <> 'archived'
      and (p_booking_period_id is null or bp.id = p_booking_period_id)
  ),
  beds as (
    select r.room_type_id, b.id as bed_id,
           (b.status = 'active' and r.status = 'active') as in_service
    from public.beds b
    join public.rooms r on r.tenant_id = b.tenant_id and r.id = b.room_id
    where b.tenant_id = p_tenant_id
      and b.status <> 'retired'
      and r.status <> 'retired'
  )
  select rt.id,
         p.id,
         count(b.bed_id)::integer,
         count(b.bed_id) filter (where not b.in_service)::integer,
         count(b.bed_id) filter (where b.in_service and blk.blocked)::integer,
         count(b.bed_id) filter (where b.in_service and not blk.blocked)::integer
  from public.room_types rt
  cross join periods p
  left join beds b on b.room_type_id = rt.id
  left join lateral (
    select exists (
      select 1 from public.bed_blocks bb
      where bb.tenant_id = p_tenant_id
        and bb.bed_id = b.bed_id
        and bb.released_at is null
        and bb.blocked && p.stay
    ) as blocked
  ) blk on true
  where rt.tenant_id = p_tenant_id
  group by rt.id, p.id
$$;

-- Staff view (capacity table in the inventory UI). Returns no rows without inventory.read,
-- inventory.manage or break-glass, so it reveals nothing about other hostels.
create function public.room_type_capacity(p_tenant_id uuid, p_booking_period_id uuid default null)
returns table (
  room_type_id uuid,
  booking_period_id uuid,
  total_beds integer,
  out_of_service_beds integer,
  blocked_beds integer,
  sellable_beds integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.*
  from app.room_type_capacity(p_tenant_id, p_booking_period_id) c
  where app.has_permission(p_tenant_id, 'inventory.read')
     or app.has_permission(p_tenant_id, 'inventory.manage')
     or app.has_break_glass(p_tenant_id)
$$;

revoke execute on function public.room_type_capacity(uuid, uuid) from public, anon;
grant execute on function public.room_type_capacity(uuid, uuid) to authenticated, service_role;

-- Postgres grants EXECUTE on new functions to PUBLIC; app.room_type_capacity stays internal.
revoke execute on all functions in schema app from public;
