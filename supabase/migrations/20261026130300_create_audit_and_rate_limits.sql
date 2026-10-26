-- Phase 1, task 3. Append-only audit log and database-backed rate limits.
-- Design: docs/DATABASE_DESIGN.md §4.6, docs/SECURITY_THREAT_MODEL.md T15-T17 and §5.

create table public.audit_logs (
  id bigint generated always as identity primary key,
  -- No foreign keys: audit history must outlive the rows (and tenants, users) it describes.
  tenant_id uuid,
  actor_user_id uuid,
  actor_type text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  reason text,
  request_id text,
  ip_hash text,
  occurred_at timestamptz not null default now(),
  constraint audit_logs_actor_type_check check (actor_type in ('user', 'platform_admin', 'system', 'webhook', 'cron')),
  constraint audit_logs_action_format check (action ~ '^[a-z_]+\.[a-z_]+$')
);

create index audit_logs_tenant_occurred_idx on public.audit_logs (tenant_id, occurred_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);

comment on table public.audit_logs is 'Append-only record of state changes. Sensitive values are redacted before storage.';

-- Append-only: nobody may change or remove history, including the table owner and service role.
create function app.prevent_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_logs is append-only (% is not allowed)', tg_op using errcode = '42501';
end;
$$;

create trigger audit_logs_no_update_delete
  before update or delete on public.audit_logs
  for each row execute function app.prevent_audit_mutation();
create trigger audit_logs_no_truncate
  before truncate on public.audit_logs
  for each statement execute function app.prevent_audit_mutation();

-- Removes or masks personal data that the audit trail does not need (SECURITY_THREAT_MODEL T15).
create function app.redact_for_audit(row_data jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when row_data is null then null else
    (row_data - array['student_id_number', 'emergency_contact_name', 'emergency_contact_relationship', 'verification'])
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
      'emergency_contact_name', case when row_data ->> 'emergency_contact_name' is not null then '[redacted]' end
    ))
  end
$$;

-- Explicit audit entries written by RPCs (approvals, refunds, break-glass, ...).
create function app.write_audit(
  p_tenant_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_before jsonb default null,
  p_after jsonb default null,
  p_reason text default null,
  p_actor_type text default null,
  p_request_id text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  insert into public.audit_logs (tenant_id, actor_user_id, actor_type, action, entity_type, entity_id, before, after, reason, request_id)
  values (
    p_tenant_id,
    auth.uid(),
    coalesce(p_actor_type, case when auth.uid() is null then 'system' else 'user' end),
    p_action,
    p_entity_type,
    p_entity_id,
    app.redact_for_audit(p_before),
    app.redact_for_audit(p_after),
    p_reason,
    p_request_id
  )
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function app.write_audit(uuid, text, text, text, jsonb, jsonb, text, text, text) to service_role;

-- Row-change audit for tables whose every change matters (DATABASE_DESIGN "Audit: yes").
create function app.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_tenant uuid;
  v_entity text;
begin
  -- Skip updates that change nothing but updated_at.
  if tg_op = 'UPDATE' and (v_old - 'updated_at') = (v_new - 'updated_at') then
    return new;
  end if;

  v_tenant := case
    when tg_table_name = 'tenants' then (v_row ->> 'id')::uuid
    else nullif(v_row ->> 'tenant_id', '')::uuid
  end;
  v_entity := coalesce(v_row ->> 'id', v_row ->> 'user_id', v_row ->> 'tenant_id');

  insert into public.audit_logs (tenant_id, actor_user_id, actor_type, action, entity_type, entity_id, before, after)
  values (
    v_tenant,
    auth.uid(),
    case when auth.uid() is null then 'system' else 'user' end,
    tg_table_name || '.' || case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end,
    tg_table_name,
    v_entity,
    app.redact_for_audit(v_old),
    app.redact_for_audit(v_new)
  );
  return coalesce(new, old);
end;
$$;

create trigger tenants_audit after insert or update or delete on public.tenants
  for each row execute function app.audit_row_change();
create trigger tenant_domains_audit after insert or update or delete on public.tenant_domains
  for each row execute function app.audit_row_change();
create trigger tenant_profiles_audit after insert or update or delete on public.tenant_profiles
  for each row execute function app.audit_row_change();
create trigger tenant_settings_audit after insert or update or delete on public.tenant_settings
  for each row execute function app.audit_row_change();
create trigger platform_admins_audit after insert or update or delete on public.platform_admins
  for each row execute function app.audit_row_change();
create trigger platform_access_grants_audit after insert or update or delete on public.platform_access_grants
  for each row execute function app.audit_row_change();
create trigger permission_sets_audit after insert or update or delete on public.permission_sets
  for each row execute function app.audit_row_change();
create trigger tenant_memberships_audit after insert or update or delete on public.tenant_memberships
  for each row execute function app.audit_row_change();
create trigger residents_audit after insert or update or delete on public.residents
  for each row execute function app.audit_row_change();

alter table public.audit_logs enable row level security;
alter table public.audit_logs force row level security;
revoke all on public.audit_logs from anon, authenticated;
revoke update, delete, truncate on public.audit_logs from service_role;

-- Fixed-window rate limit counters for public endpoints (no extra service).
create table private.rate_limits (
  bucket_key text primary key,
  window_start timestamptz not null,
  hits integer not null,
  constraint rate_limits_hits_positive check (hits > 0)
);

-- Counts one hit for p_key; returns true while the caller is within p_limit hits per p_window.
-- Server-side only (service role): callers must not choose other people's bucket keys.
create function app.check_rate_limit(p_key text, p_limit integer, p_window interval)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hits integer;
begin
  if p_key is null or p_limit < 1 or p_window <= interval '0' then
    raise exception 'invalid rate limit arguments' using errcode = '22023';
  end if;

  insert into private.rate_limits as rl (bucket_key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (bucket_key) do update
    set window_start = case when rl.window_start <= now() - p_window then now() else rl.window_start end,
        hits = case when rl.window_start <= now() - p_window then 1 else rl.hits + 1 end
  returning hits into v_hits;

  return v_hits <= p_limit;
end;
$$;

grant execute on function app.check_rate_limit(text, integer, interval) to service_role;

-- Postgres grants EXECUTE on new functions to PUBLIC, and per-schema default privileges cannot
-- remove that global default, so revoke explicitly. Explicit grants above/below are kept.
revoke execute on all functions in schema app from public;
