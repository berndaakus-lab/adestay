-- Phase 3, task 1. Booking workflow tables: booking_requests and reservations (inventory holds).
-- Design: docs/DATABASE_DESIGN.md §1, §4.4, §5; docs/BOOKING_AND_PAYMENT_FLOWS.md §2-§4;
--         docs/adr/0003-booking-concurrency.md; docs/RBAC_MATRIX.md §4;
--         docs/SECURITY_THREAT_MODEL.md §4 (RLS checklist).
--
-- These are workflow tables: API roles can only read them, through RLS. Every write will go through
-- the SECURITY DEFINER RPCs added in later Phase 3 tasks.
--
-- Parent keys use NO ACTION rather than RESTRICT: a period, room type or resident with bookings
-- cannot be deleted, but NO ACTION is checked at the end of the statement, so the cascade from
-- deleting a whole tenant (scripted offboarding, DATABASE_DESIGN §7) still works.

-- ---------------------------------------------------------------------------------------------
-- booking_requests
-- ---------------------------------------------------------------------------------------------
create table public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  reference text not null,
  resident_id uuid not null,
  booking_period_id uuid not null,
  room_type_id uuid not null,
  status text not null default 'submitted',
  quoted_amount_minor bigint not null,
  quoted_deposit_minor bigint not null default 0,
  currency char(3) not null default 'GHS',
  student_note text,
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  decision_reason text,
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users (id) on delete set null,
  cancel_reason text,
  idempotency_key uuid not null,
  source text not null default 'web',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_requests_tenant_id_id_key unique (tenant_id, id),
  -- Target of the reservation FK, so a hold always matches its request's room type and period.
  constraint booking_requests_tenant_id_type_period_key unique (tenant_id, id, room_type_id, booking_period_id),
  constraint booking_requests_tenant_reference_key unique (tenant_id, reference),
  constraint booking_requests_idempotency_key unique (tenant_id, resident_id, idempotency_key),
  constraint booking_requests_resident_fk foreign key (tenant_id, resident_id)
    references public.residents (tenant_id, id),
  constraint booking_requests_period_fk foreign key (tenant_id, booking_period_id)
    references public.booking_periods (tenant_id, id),
  constraint booking_requests_room_type_fk foreign key (tenant_id, room_type_id)
    references public.room_types (tenant_id, id),
  -- <TENANT_PREFIX>-<6 chars Crockford base32> (DATABASE_DESIGN §1).
  constraint booking_requests_reference_format check (reference ~ '^[A-Z]{2,4}-[0-9A-HJKMNP-TV-Z]{6}$'),
  constraint booking_requests_status_check check (status in (
    'submitted', 'under_review', 'approved', 'rejected', 'waitlisted',
    'withdrawn', 'expired', 'cancelled', 'lapsed'
  )),
  constraint booking_requests_source_check check (source in ('web', 'staff')),
  constraint booking_requests_amount_range check (quoted_amount_minor > 0 and quoted_amount_minor <= 100000000),
  constraint booking_requests_deposit_range check (quoted_deposit_minor >= 0 and quoted_deposit_minor <= quoted_amount_minor),
  constraint booking_requests_currency_check check (currency = 'GHS'),
  constraint booking_requests_note_length check (student_note is null or char_length(student_note) <= 1000),
  constraint booking_requests_decision_reason_length check (decision_reason is null or char_length(decision_reason) <= 1000),
  constraint booking_requests_cancel_reason_length check (cancel_reason is null or char_length(cancel_reason) <= 1000),
  constraint booking_requests_decided_has_time check (status not in ('approved', 'rejected') or decided_at is not null),
  constraint booking_requests_rejected_has_reason check (
    status <> 'rejected' or nullif(btrim(decision_reason), '') is not null
  ),
  constraint booking_requests_cancelled_has_reason check (
    status <> 'cancelled' or (cancelled_at is not null and nullif(btrim(cancel_reason), '') is not null)
  )
);

-- One live request per student per period.
create unique index booking_requests_one_live_per_period on public.booking_requests (tenant_id, resident_id, booking_period_id)
  where status in ('submitted', 'under_review', 'waitlisted', 'approved');
create index booking_requests_queue_idx on public.booking_requests (tenant_id, status, submitted_at);
create index booking_requests_type_period_idx on public.booking_requests (tenant_id, booking_period_id, room_type_id, status);
create index booking_requests_room_type_idx on public.booking_requests (tenant_id, room_type_id);

comment on table public.booking_requests is 'A student''s request for a room type in a period. Submitting never holds capacity.';

-- ---------------------------------------------------------------------------------------------
-- reservations: capacity held at room-type level for an approved request
-- ---------------------------------------------------------------------------------------------
create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  booking_request_id uuid not null,
  room_type_id uuid not null,
  booking_period_id uuid not null,
  status text not null default 'held',
  hold_expires_at timestamptz,
  extensions_used smallint not null default 0,
  confirmed_at timestamptz,
  ended_at timestamptz,
  end_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservations_tenant_id_id_key unique (tenant_id, id),
  constraint reservations_booking_request_key unique (booking_request_id),
  constraint reservations_request_fk foreign key (tenant_id, booking_request_id, room_type_id, booking_period_id)
    references public.booking_requests (tenant_id, id, room_type_id, booking_period_id),
  constraint reservations_room_type_fk foreign key (tenant_id, room_type_id)
    references public.room_types (tenant_id, id),
  constraint reservations_period_fk foreign key (tenant_id, booking_period_id)
    references public.booking_periods (tenant_id, id),
  constraint reservations_status_check check (status in ('held', 'confirmed', 'released', 'expired', 'cancelled', 'fulfilled')),
  -- tenant_settings.hold_extension_max is at most 3.
  constraint reservations_extensions_range check (extensions_used between 0 and 3),
  constraint reservations_held_has_expiry check (status <> 'held' or hold_expires_at is not null),
  constraint reservations_confirmed_has_time check (status not in ('confirmed', 'fulfilled') or confirmed_at is not null),
  constraint reservations_ended_has_time check (status not in ('released', 'expired', 'cancelled') or ended_at is not null),
  constraint reservations_end_reason_length check (end_reason is null or char_length(end_reason) <= 1000)
);

-- Includes fulfilled because the capacity rule counts it (BOOKING_AND_PAYMENT_FLOWS §3).
create index reservations_live_idx on public.reservations (tenant_id, room_type_id, booking_period_id)
  where status in ('held', 'confirmed', 'fulfilled');
create index reservations_hold_expiry_idx on public.reservations (hold_expires_at) where status = 'held';
create index reservations_period_idx on public.reservations (tenant_id, booking_period_id);

comment on table public.reservations is 'Capacity held for an approved request, at room-type level. A specific bed is assigned separately.';

-- ---------------------------------------------------------------------------------------------
-- Audit: a student's free-text note and the idempotency key do not belong in the audit trail
-- ---------------------------------------------------------------------------------------------
create or replace function app.redact_for_audit(row_data jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when row_data is null then null else
    (row_data - array['student_id_number', 'emergency_contact_name', 'emergency_contact_relationship', 'verification',
                      'student_note', 'idempotency_key'])
    || jsonb_strip_nulls(jsonb_build_object(
      'phone_e164', case when row_data ? 'phone_e164' and row_data ->> 'phone_e164' is not null
                         then '***' || right(row_data ->> 'phone_e164', 3) end,
      'emergency_contact_phone', case when row_data ? 'emergency_contact_phone' and row_data ->> 'emergency_contact_phone' is not null
                                      then '***' || right(row_data ->> 'emergency_contact_phone', 3) end,
      'contact_phone', case when row_data ? 'contact_phone' and row_data ->> 'contact_phone' is not null
                            then '***' || right(row_data ->> 'contact_phone', 3) end,
      'whatsapp_phone', case when row_data ? 'whatsapp_phone' and row_data ->> 'whatsapp_phone' is not null
                             then '***' || right(row_data ->> 'whatsapp_phone', 3) end,
      'student_id_number', case when row_data ->> 'student_id_number' is not null then '[redacted]' end,
      'emergency_contact_name', case when row_data ->> 'emergency_contact_name' is not null then '[redacted]' end,
      'student_note', case when row_data ->> 'student_note' is not null then '[redacted]' end
    ))
  end
$$;

create trigger booking_requests_set_updated_at before update on public.booking_requests
  for each row execute function app.set_updated_at();
create trigger reservations_set_updated_at before update on public.reservations
  for each row execute function app.set_updated_at();

create trigger booking_requests_audit after insert or update or delete on public.booking_requests
  for each row execute function app.audit_row_change();
create trigger reservations_audit after insert or update or delete on public.reservations
  for each row execute function app.audit_row_change();

-- ---------------------------------------------------------------------------------------------
-- Row level security: read only for API roles; never public
-- ---------------------------------------------------------------------------------------------
alter table public.booking_requests enable row level security;
alter table public.booking_requests force row level security;
alter table public.reservations enable row level security;
alter table public.reservations force row level security;

revoke all on public.booking_requests, public.reservations from anon, authenticated;
grant select on public.booking_requests, public.reservations to authenticated;

create policy booking_requests_select_own on public.booking_requests for select to authenticated
  using (resident_id = app.my_resident_id(tenant_id));
create policy booking_requests_select_staff on public.booking_requests for select to authenticated
  using (app.has_permission(tenant_id, 'bookings.read') or app.has_break_glass(tenant_id));

create policy reservations_select_own on public.reservations for select to authenticated
  using (exists (
    select 1 from public.booking_requests br
    where br.tenant_id = reservations.tenant_id
      and br.id = reservations.booking_request_id
      and br.resident_id = app.my_resident_id(reservations.tenant_id)
  ));
create policy reservations_select_staff on public.reservations for select to authenticated
  using (app.has_permission(tenant_id, 'bookings.read') or app.has_break_glass(tenant_id));

-- Postgres grants EXECUTE on new functions to PUBLIC; keep app helpers closed.
revoke execute on all functions in schema app from public;
