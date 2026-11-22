-- Phase 3, task 9. The details a booking email needs, for the people allowed to see them.
-- Design: docs/BOOKING_AND_PAYMENT_FLOWS.md §2.1 (notifications); docs/RBAC_MATRIX.md §2, §4;
--         docs/SECURITY_THREAT_MODEL.md T14; product owner decision on student emails, 2026-11-22.
--
-- public.booking_email_details runs with the caller's session: the student themself, or staff who
-- hold both bookings.read and residents.read. Staff without residents.read cannot obtain a
-- student's contact details this way, so no email is sent for their action and they are warned.
-- public.booking_email_details_for_job is for the expiry job (service role only).

create function app.booking_email_details(p_request_id uuid)
returns table (
  recipient_email text,
  student_name text,
  hostel_name text,
  hostel_email text,
  hostel_phone text,
  booking_reference text,
  room_type_name text,
  period_name text,
  starts_on date,
  ends_on date,
  quoted_amount_minor bigint,
  quoted_deposit_minor bigint,
  request_status text,
  decision_reason text,
  hold_expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.email::text, r.full_name, tp.display_name, tp.contact_email::text, tp.contact_phone,
         br.reference, rt.name, bp.name, bp.starts_on, bp.ends_on,
         br.quoted_amount_minor, br.quoted_deposit_minor, br.status, br.decision_reason, res.hold_expires_at
  from public.booking_requests br
  join public.residents r on r.tenant_id = br.tenant_id and r.id = br.resident_id
  join public.tenant_profiles tp on tp.tenant_id = br.tenant_id
  join public.room_types rt on rt.tenant_id = br.tenant_id and rt.id = br.room_type_id
  join public.booking_periods bp on bp.tenant_id = br.tenant_id and bp.id = br.booking_period_id
  left join public.reservations res on res.tenant_id = br.tenant_id and res.booking_request_id = br.id
  where br.id = p_request_id
$$;

create function public.booking_email_details(p_request_id uuid)
returns table (
  recipient_email text,
  student_name text,
  hostel_name text,
  hostel_email text,
  hostel_phone text,
  booking_reference text,
  room_type_name text,
  period_name text,
  starts_on date,
  ends_on date,
  quoted_amount_minor bigint,
  quoted_deposit_minor bigint,
  request_status text,
  decision_reason text,
  hold_expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.*
  from public.booking_requests br
  cross join lateral app.booking_email_details(br.id) d
  where br.id = p_request_id
    and (
      br.resident_id = app.my_resident_id(br.tenant_id)
      or (app.has_permission(br.tenant_id, 'bookings.read') and app.has_permission(br.tenant_id, 'residents.read'))
    )
$$;

create function public.booking_email_details_for_job(p_request_id uuid)
returns table (
  recipient_email text,
  student_name text,
  hostel_name text,
  hostel_email text,
  hostel_phone text,
  booking_reference text,
  room_type_name text,
  period_name text,
  starts_on date,
  ends_on date,
  quoted_amount_minor bigint,
  quoted_deposit_minor bigint,
  request_status text,
  decision_reason text,
  hold_expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from app.booking_email_details(p_request_id)
$$;

revoke execute on function public.booking_email_details(uuid) from public, anon;
grant execute on function public.booking_email_details(uuid) to authenticated;
revoke execute on function public.booking_email_details_for_job(uuid) from public, anon, authenticated;
grant execute on function public.booking_email_details_for_job(uuid) to service_role;

revoke execute on all functions in schema app from public;
