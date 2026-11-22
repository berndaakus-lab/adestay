-- Phase 3, task 8 fix. Found by the parallel test on real PostgreSQL: many simultaneous copies of
-- one submission each counted against the 5-per-hour limit before any had committed, so later
-- copies got "too many requests" instead of the original reference (acceptance criterion 3).
-- Submissions are now serialised per student with a transaction-level advisory lock.
-- Design: docs/BOOKING_AND_PAYMENT_FLOWS.md §5 (scenario 11); docs/SECURITY_THREAT_MODEL.md §5.
-- The function's signature and grants are unchanged.

create or replace function public.submit_booking_request(
  p_tenant_id uuid,
  p_booking_period_id uuid,
  p_room_type_id uuid,
  p_idempotency_key uuid,
  p_full_name text,
  p_phone_e164 text,
  p_institution text default null,
  p_programme text default null,
  p_level text default null,
  p_student_id_number text default null,
  p_gender text default null,
  p_student_note text default null
)
returns table (request_id uuid, booking_reference text, request_status text, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_email extensions.citext;
  v_confirmed timestamptz;
  v_prefix text;
  v_settings public.tenant_settings%rowtype;
  v_resident uuid;
  v_resident_status text;
  v_room_gender text;
  v_amount bigint;
  v_price_deposit bigint;
  v_deposit bigint;
  v_id uuid;
  v_reference text;
  v_status text;
  v_constraint text;
  v_name text := btrim(p_full_name);
  v_phone text := btrim(p_phone_e164);
  v_institution text := nullif(btrim(p_institution), '');
  v_programme text := nullif(btrim(p_programme), '');
  v_level text := nullif(btrim(p_level), '');
  v_student_id text := nullif(btrim(p_student_id_number), '');
  v_gender text := nullif(btrim(p_gender), '');
  v_note text := nullif(btrim(p_student_note), '');
begin
  if v_user is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_tenant_id is null or p_booking_period_id is null or p_room_type_id is null or p_idempotency_key is null then
    raise exception 'missing booking details' using errcode = '22023';
  end if;

  -- One submission per student at a time, held until commit. A parallel retry then sees the
  -- committed request and returns it, instead of using up the rate limit.
  perform pg_advisory_xact_lock(hashtextextended('booking_submit:' || v_user::text, 0));

  -- D-2: the email must be verified before a request can be submitted.
  select u.email, u.email_confirmed_at into v_email, v_confirmed from auth.users u where u.id = v_user;
  if v_email is null or v_confirmed is null then
    raise exception 'verify your email first' using errcode = '42501';
  end if;

  select t.reference_prefix into v_prefix
  from public.tenants t
  join public.tenant_profiles p on p.tenant_id = t.id
  where t.id = p_tenant_id and t.status = 'active' and p.is_published;
  if v_prefix is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select * into v_settings from public.tenant_settings s where s.tenant_id = p_tenant_id;
  if not found then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select r.id, r.status into v_resident, v_resident_status
  from public.residents r where r.tenant_id = p_tenant_id and r.user_id = v_user;

  -- A retry with the same key returns the original request and does not use up the rate limit.
  if v_resident is not null then
    select br.id, br.reference, br.status into v_id, v_reference, v_status
    from public.booking_requests br
    where br.tenant_id = p_tenant_id and br.resident_id = v_resident and br.idempotency_key = p_idempotency_key;
    if found then
      return query select v_id, v_reference, v_status, false;
      return;
    end if;
    if v_resident_status = 'blocked' then
      raise exception 'not allowed' using errcode = '42501';
    end if;
  end if;

  if not app.check_rate_limit('booking_submit:' || v_user::text, 5, interval '1 hour') then
    raise exception 'too many requests' using errcode = 'AS429';
  end if;

  if v_name is null or char_length(v_name) not between 2 and 120 then
    raise exception 'enter your full name' using errcode = '22023';
  end if;
  if v_phone is null or v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'enter a valid phone number' using errcode = '22023';
  end if;
  if char_length(coalesce(v_institution, '')) > 120 or char_length(coalesce(v_programme, '')) > 120
     or char_length(coalesce(v_level, '')) > 40 or char_length(coalesce(v_student_id, '')) > 40
     or char_length(coalesce(v_note, '')) > 1000 then
    raise exception 'a detail is too long' using errcode = '22023';
  end if;
  if v_settings.student_id_required and v_student_id is null then
    raise exception 'enter your student ID number' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.booking_periods bp
    where bp.tenant_id = p_tenant_id and bp.id = p_booking_period_id and bp.status = 'open'
      and (bp.booking_opens_at is null or bp.booking_opens_at <= now())
      and (bp.booking_closes_at is null or bp.booking_closes_at > now())
  ) then
    raise exception 'this period is not open for booking' using errcode = '22023';
  end if;

  select rt.gender_policy into v_room_gender
  from public.room_types rt
  where rt.tenant_id = p_tenant_id and rt.id = p_room_type_id and rt.is_published;
  if v_room_gender is null then
    raise exception 'this room type is not available' using errcode = '22023';
  end if;

  select pr.amount_minor, pr.deposit_minor into v_amount, v_price_deposit
  from public.room_type_prices pr
  where pr.tenant_id = p_tenant_id and pr.room_type_id = p_room_type_id and pr.booking_period_id = p_booking_period_id;
  if v_amount is null then
    raise exception 'this room type has no price for this period' using errcode = '22023';
  end if;

  -- D-14: gender is collected and checked only for hostels that separate rooms by gender.
  if v_settings.gender_policy_enforced then
    if v_gender is null or v_gender not in ('female', 'male', 'undisclosed') then
      raise exception 'choose a gender' using errcode = '22023';
    end if;
    if v_room_gender <> 'any' and v_gender <> v_room_gender then
      raise exception 'this room type is not available for you' using errcode = '22023';
    end if;
  else
    v_gender := null;
  end if;

  v_deposit := app.quote_deposit(v_settings.deposit_policy, v_settings.deposit_value, v_amount, v_price_deposit);

  insert into public.residents as r
    (tenant_id, user_id, full_name, email, phone_e164, gender, institution, programme, level, student_id_number)
  values
    (p_tenant_id, v_user, v_name, v_email, v_phone, v_gender, v_institution, v_programme, v_level, v_student_id)
  on conflict (tenant_id, user_id) where user_id is not null do update
    set full_name = excluded.full_name,
        email = excluded.email,
        phone_e164 = excluded.phone_e164,
        gender = coalesce(excluded.gender, r.gender),
        institution = coalesce(excluded.institution, r.institution),
        programme = coalesce(excluded.programme, r.programme),
        level = coalesce(excluded.level, r.level),
        student_id_number = coalesce(excluded.student_id_number, r.student_id_number)
  returning r.id, r.status into v_resident, v_resident_status;

  -- A block applied between the first read and this upsert still stops the request.
  if v_resident_status = 'blocked' then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  for attempt in 1..5 loop
    begin
      v_reference := app.generate_booking_reference(v_prefix);
      insert into public.booking_requests
        (tenant_id, reference, resident_id, booking_period_id, room_type_id, quoted_amount_minor,
         quoted_deposit_minor, student_note, idempotency_key, source)
      values
        (p_tenant_id, v_reference, v_resident, p_booking_period_id, p_room_type_id, v_amount,
         v_deposit, v_note, p_idempotency_key, 'web')
      returning id into v_id;
      exit;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'booking_requests_idempotency_key' then
        -- A parallel double-submit won the race: return its request.
        select br.id, br.reference, br.status into v_id, v_reference, v_status
        from public.booking_requests br
        where br.tenant_id = p_tenant_id and br.resident_id = v_resident and br.idempotency_key = p_idempotency_key;
        return query select v_id, v_reference, v_status, false;
        return;
      elsif v_constraint = 'booking_requests_one_live_per_period' then
        raise exception 'you already have a booking request for this period' using errcode = '23505';
      elsif v_constraint <> 'booking_requests_tenant_reference_key' or attempt = 5 then
        raise;
      end if;
    end;
  end loop;

  perform app.write_audit(p_tenant_id, 'booking.submitted', 'booking_requests', v_id::text, null,
    jsonb_build_object('reference', v_reference, 'status', 'submitted',
                       'room_type_id', p_room_type_id, 'booking_period_id', p_booking_period_id));

  return query select v_id, v_reference, 'submitted'::text, true;
end;
$$;

revoke execute on all functions in schema app from public;
