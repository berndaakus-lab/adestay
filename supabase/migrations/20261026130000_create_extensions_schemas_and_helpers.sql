-- Phase 1, task 3. Foundations shared by every later migration.
-- Design: docs/DATABASE_DESIGN.md §1 (conventions) and §3 (helper functions), docs/RBAC_MATRIX.md §2.

-- Extensions live in Supabase's `extensions` schema; references are schema-qualified.....
create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;

-- `app`: helper functions used by RLS policies and RPCs. Not exposed through the Data API.
-- `private`: secrets, rate-limit buckets, raw webhook payloads. No API role may touch it.
create schema if not exists app;
create schema if not exists private;

revoke all on schema app from public;
revoke all on schema private from public;
revoke all on schema private from anon, authenticated;
-- Policies evaluated for API roles call app.* functions, so those roles need USAGE.
-- EXECUTE is granted per function, never by default.
grant usage on schema app to anon, authenticated, service_role;

-- Note: these per-schema defaults cannot remove the global PUBLIC EXECUTE default; every
-- migration that creates functions also ends with an explicit REVOKE ... FROM public.
alter default privileges in schema app revoke execute on functions from public;
alter default privileges in schema private revoke execute on functions from public;

-- Keeps updated_at current on every table that has one.
create function app.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- The fixed permission catalog (docs/RBAC_MATRIX.md §2). Changing it needs a migration.
create function app.permission_catalog()
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select array[
    'bookings.read', 'bookings.review', 'bookings.cancel', 'bookings.create_on_behalf',
    'allocations.read', 'allocations.manage',
    'inventory.read', 'inventory.manage', 'pricing.manage',
    'residents.read', 'residents.read_sensitive', 'residents.manage',
    'checkin.manage',
    'finance.read', 'finance.invoice_manage', 'finance.record_payment',
    'finance.refund_request', 'finance.refund_approve',
    'maintenance.read', 'maintenance.manage',
    'announcements.manage',
    'reports.read', 'reports.export',
    'settings.read', 'settings.manage',
    'payments.configure', 'staff.manage', 'audit.read'
  ]::text[]
$$;

-- Permissions that may be placed in a staff permission set. payments.configure and
-- staff.manage stay with hostel admins only in v1 (RBAC_MATRIX §2).
create function app.delegable_permissions()
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select array(
    select p from unnest(app.permission_catalog()) as p
    where p not in ('payments.configure', 'staff.manage')
  )
$$;

create function app.valid_permissions(perms text[])
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select perms is not null
     and perms <@ app.delegable_permissions()
     and cardinality(perms) = (select count(distinct p) from unnest(perms) as p)
$$;

grant execute on function app.permission_catalog(), app.delegable_permissions(), app.valid_permissions(text[])
  to authenticated, service_role;

-- Postgres grants EXECUTE on new functions to PUBLIC, and per-schema default privileges cannot
-- remove that global default, so revoke explicitly. Explicit grants above/below are kept.
revoke execute on all functions in schema app from public;
