-- Phase 1, task 6 (database part). Phase 1 acceptance criterion 4: "the last hostel admin
-- cannot be removed" (docs/IMPLEMENTATION_PLAN.md, docs/RBAC_MATRIX.md §5.4).
-- Enforced in the database so no code path (API, RPC, service role, SQL Editor) can leave a live
-- hostel without anyone able to manage staff. Archived tenants are exempt so a scripted,
-- approved tenant deletion (archive first) can still proceed.

create function app.protect_last_hostel_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_still_admin boolean := tg_op = 'UPDATE' and new.role = 'hostel_admin' and new.status = 'active';
begin
  if old.role <> 'hostel_admin' or old.status <> 'active' or v_still_admin then
    return coalesce(new, old);
  end if;

  if exists (select 1 from public.tenants t where t.id = old.tenant_id and t.status = 'archived') then
    return coalesce(new, old);
  end if;

  -- Serialise concurrent removals of two different admins of the same tenant.
  perform 1 from public.tenants t where t.id = old.tenant_id for update;

  if not exists (
    select 1 from public.tenant_memberships m
    where m.tenant_id = old.tenant_id
      and m.id <> old.id
      and m.role = 'hostel_admin'
      and m.status = 'active'
  ) then
    raise exception 'cannot remove the last active hostel admin of tenant %', old.tenant_id
      using errcode = '23514', hint = 'Make another member a hostel admin first.';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger tenant_memberships_protect_last_admin
  before update of role, status or delete on public.tenant_memberships
  for each row execute function app.protect_last_hostel_admin();

revoke execute on all functions in schema app from public;
