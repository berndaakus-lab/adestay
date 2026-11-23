-- Phase 3, task 14. What a visitor can book: period, price, quoted deposit and availability.
-- Design: docs/BOOKING_AND_PAYMENT_FLOWS.md §3 (indicator, D-4); docs/RBAC_MATRIX.md §4;
--         deposit rule (product owner, 2026-11-22).
--
-- tenant_settings is private, so visitors cannot work out the deposit themselves. This returns the
-- same quote submit_booking_request will snapshot, and no setting or bed count.

create function public.room_type_public_offers(p_tenant_id uuid)
returns table (
  room_type_id uuid,
  booking_period_id uuid,
  period_name text,
  period_kind text,
  starts_on date,
  ends_on date,
  amount_minor bigint,
  deposit_minor bigint,
  availability text
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.room_type_id,
         i.booking_period_id,
         bp.name,
         bp.kind,
         bp.starts_on,
         bp.ends_on,
         pr.amount_minor,
         app.quote_deposit(s.deposit_policy, s.deposit_value, pr.amount_minor, pr.deposit_minor),
         i.availability
  from public.room_type_availability_indicators(p_tenant_id) i
  join public.booking_periods bp on bp.tenant_id = p_tenant_id and bp.id = i.booking_period_id
  join public.room_type_prices pr on pr.tenant_id = p_tenant_id
    and pr.room_type_id = i.room_type_id and pr.booking_period_id = i.booking_period_id
  join public.tenant_settings s on s.tenant_id = p_tenant_id
  order by bp.starts_on, bp.name
$$;

revoke execute on function public.room_type_public_offers(uuid) from public;
grant execute on function public.room_type_public_offers(uuid) to anon, authenticated, service_role;

revoke execute on all functions in schema app from public;
