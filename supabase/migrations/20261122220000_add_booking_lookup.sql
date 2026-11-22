-- Phase 3, task 7. Public booking lookup: reference plus email or phone, status only.
-- Design: docs/SECURITY_THREAT_MODEL.md T3, T6, T14, §5 (5 per 15 minutes per IP);
--         docs/RBAC_MATRIX.md §4; docs/PRODUCT_REQUIREMENTS.md PB-5; Phase 3 acceptance criterion 5.
--
-- Called only by src/lib/server/booking-lookup (task 11) with the service role. The tenant comes
-- from the server's host resolution. p_client_key is a SHA-256 hex digest of the visitor's IP, so
-- the rate-limit table never stores a raw IP address.
--
-- The function never raises for a failed lookup: an exception would roll back the rate-limit hit.
-- Wrong reference, wrong contact and unavailable hostel all return the same 'not_found'.

create function public.lookup_booking(p_tenant_id uuid, p_reference text, p_contact text, p_client_key text)
returns table (outcome text, booking_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reference text := upper(regexp_replace(coalesce(p_reference, ''), '\s', '', 'g'));
  v_contact text := lower(btrim(coalesce(p_contact, '')));
  v_request_status text;
  v_reservation_status text;
begin
  if p_client_key is null or p_client_key !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid client key' using errcode = '22023';
  end if;

  if not app.check_rate_limit('booking_lookup:' || p_client_key, 5, interval '15 minutes') then
    return query select 'rate_limited'::text, null::text;
    return;
  end if;

  if v_reference !~ '^[A-Z]{2,4}-[0-9A-Z]{6}$' or v_contact = '' or char_length(v_contact) > 254 then
    return query select 'not_found'::text, null::text;
    return;
  end if;

  -- Forgive the look-alike characters Crockford base32 leaves out, in the code part only:
  -- a hostel prefix may legitimately contain O, I or L.
  v_reference := split_part(v_reference, '-', 1) || '-' || translate(split_part(v_reference, '-', 2), 'OIL', '011');

  select br.status, res.status into v_request_status, v_reservation_status
  from public.booking_requests br
  join public.tenants t on t.id = br.tenant_id and t.status in ('active', 'suspended')
  join public.residents r on r.tenant_id = br.tenant_id and r.id = br.resident_id
  left join public.reservations res on res.tenant_id = br.tenant_id and res.booking_request_id = br.id
  where br.tenant_id = p_tenant_id
    and br.reference = v_reference
    and case when v_contact like '%@%' then lower(r.email::text) = v_contact
             else r.phone_e164 = v_contact end;

  if v_request_status is null then
    return query select 'not_found'::text, null::text;
    return;
  end if;

  return query select 'found'::text,
    case when v_reservation_status = 'fulfilled' then 'checked_in'
         when v_request_status = 'approved' and v_reservation_status = 'confirmed' then 'confirmed'
         else v_request_status end;
end;
$$;

revoke execute on function public.lookup_booking(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.lookup_booking(uuid, text, text, text) to service_role;

revoke execute on all functions in schema app from public;
