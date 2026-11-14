-- Phase 2, task 1. Inventory and pricing: booking periods, room types (+ photos), rooms, beds,
-- bed blocks and prices per room type and period.
-- Design: docs/DATABASE_DESIGN.md §1 (conventions), §4.3, §5; docs/RBAC_MATRIX.md §4;
--         docs/SECURITY_THREAT_MODEL.md §4 (RLS checklist).
--
-- Isolation: every table has tenant_id, unique (tenant_id, id) and composite foreign keys to its
-- parents, so a row can never point at another tenant's row. tenant_id and parent keys that must
-- not move are left out of the UPDATE column grants.
-- Writes here are simple single-row edits, so they use RLS policies (DATABASE_DESIGN §3) gated by
-- inventory.manage (pricing.manage for prices). Workflow tables (Phase 3+) stay RPC-only.

-- ---------------------------------------------------------------------------------------------
-- booking_periods
-- ---------------------------------------------------------------------------------------------
create table public.booking_periods (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  kind text not null,
  starts_on date not null,
  ends_on date not null,
  -- CASE lets the ends_on > starts_on check report a clear 23514 instead of a range error.
  stay daterange generated always as (
    case when ends_on >= starts_on then daterange(starts_on, ends_on, '[]') end
  ) stored,
  booking_opens_at timestamptz,
  booking_closes_at timestamptz,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_periods_tenant_id_id_key unique (tenant_id, id),
  constraint booking_periods_tenant_name_key unique (tenant_id, name),
  constraint booking_periods_name_length check (char_length(btrim(name)) between 2 and 120),
  constraint booking_periods_kind_check check (kind in ('academic_year', 'semester', 'vacation', 'short_stay')),
  constraint booking_periods_status_check check (status in ('draft', 'open', 'closed', 'archived')),
  constraint booking_periods_dates_order check (ends_on > starts_on),
  constraint booking_periods_booking_window_order check (
    booking_opens_at is null or booking_closes_at is null or booking_closes_at > booking_opens_at
  )
);

create index booking_periods_tenant_status_idx on public.booking_periods (tenant_id, status);
create index booking_periods_tenant_stay_idx on public.booking_periods
  using gist (tenant_id extensions.gist_uuid_ops, stay);

comment on table public.booking_periods is 'Stay periods a hostel sells (academic year, semester, vacation, short stay).';

-- ---------------------------------------------------------------------------------------------
-- room_types: the unit students request; lock point for capacity checks (DATABASE_DESIGN §5)
-- ---------------------------------------------------------------------------------------------
create table public.room_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  slug extensions.citext not null,
  description text,
  occupancy smallint not null,
  gender_policy text not null default 'any',
  amenities text[] not null default '{}',
  is_published boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint room_types_tenant_id_id_key unique (tenant_id, id),
  constraint room_types_tenant_slug_key unique (tenant_id, slug),
  constraint room_types_name_length check (char_length(btrim(name)) between 2 and 80),
  constraint room_types_slug_format check (slug::text ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug::text) <= 60),
  constraint room_types_description_length check (description is null or char_length(description) <= 4000),
  constraint room_types_occupancy_range check (occupancy between 1 and 12),
  constraint room_types_gender_policy_check check (gender_policy in ('any', 'female', 'male')),
  constraint room_types_amenities_limits check (
    cardinality(amenities) <= 30 and array_position(amenities, null) is null
  ),
  constraint room_types_sort_order_range check (sort_order between 0 and 10000)
);

create index room_types_tenant_published_idx on public.room_types (tenant_id, is_published, sort_order);

comment on table public.room_types is 'Bookable room categories, e.g. "4-in-a-room, shared bath". Students request a type, not a bed.';

-- ---------------------------------------------------------------------------------------------
-- room_type_photos: files live in the public bucket tenant-public/{tenant_id}/room-types/{id}/
-- ---------------------------------------------------------------------------------------------
create table public.room_type_photos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  room_type_id uuid not null,
  storage_path text not null,
  alt_text text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint room_type_photos_tenant_id_id_key unique (tenant_id, id),
  constraint room_type_photos_storage_path_key unique (storage_path),
  constraint room_type_photos_room_type_fk foreign key (tenant_id, room_type_id)
    references public.room_types (tenant_id, id) on delete cascade,
  -- Server-generated paths only, and always inside this tenant's folder for this room type.
  constraint room_type_photos_storage_path_format check (
    storage_path ~ '^[0-9a-f-]{36}/room-types/[0-9a-f-]{36}/[a-z0-9-]{8,64}\.(jpg|png|webp)$'
    and starts_with(storage_path, tenant_id::text || '/room-types/' || room_type_id::text || '/')
  ),
  constraint room_type_photos_alt_text_length check (char_length(btrim(alt_text)) between 3 and 200),
  constraint room_type_photos_sort_order_range check (sort_order between 0 and 10000)
);

create index room_type_photos_room_type_idx on public.room_type_photos (tenant_id, room_type_id, sort_order);

-- ---------------------------------------------------------------------------------------------
-- rooms: physical rooms; room numbers are not public
-- ---------------------------------------------------------------------------------------------
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  room_type_id uuid not null,
  label text not null,
  block text,
  floor text,
  gender_policy_override text,
  status text not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rooms_tenant_id_id_key unique (tenant_id, id),
  constraint rooms_tenant_label_key unique (tenant_id, label),
  constraint rooms_room_type_fk foreign key (tenant_id, room_type_id)
    references public.room_types (tenant_id, id) on delete restrict,
  constraint rooms_label_format check (char_length(btrim(label)) between 1 and 20 and label = btrim(label)),
  constraint rooms_block_length check (block is null or char_length(block) <= 40),
  constraint rooms_floor_length check (floor is null or char_length(floor) <= 20),
  constraint rooms_gender_policy_override_check check (
    gender_policy_override is null or gender_policy_override in ('any', 'female', 'male')
  ),
  constraint rooms_status_check check (status in ('active', 'maintenance', 'retired')),
  constraint rooms_notes_length check (notes is null or char_length(notes) <= 1000)
);

create index rooms_tenant_room_type_idx on public.rooms (tenant_id, room_type_id);
create index rooms_tenant_status_idx on public.rooms (tenant_id, status);

-- ---------------------------------------------------------------------------------------------
-- beds
-- ---------------------------------------------------------------------------------------------
create table public.beds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  room_id uuid not null,
  label text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint beds_tenant_id_id_key unique (tenant_id, id),
  constraint beds_room_label_key unique (tenant_id, room_id, label),
  constraint beds_room_fk foreign key (tenant_id, room_id)
    references public.rooms (tenant_id, id) on delete cascade,
  constraint beds_label_format check (char_length(btrim(label)) between 1 and 10 and label = btrim(label)),
  constraint beds_status_check check (status in ('active', 'maintenance', 'retired'))
);

create index beds_tenant_room_idx on public.beds (tenant_id, room_id);
create index beds_tenant_status_idx on public.beds (tenant_id, status);

-- ---------------------------------------------------------------------------------------------
-- bed_blocks: a bed is unavailable for a date range. Released blocks are kept as history.
-- ---------------------------------------------------------------------------------------------
create table public.bed_blocks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  bed_id uuid not null,
  blocked daterange not null,
  reason text not null,
  maintenance_request_id uuid, -- FK added with maintenance_requests (Phase 6)
  created_by uuid references auth.users (id) on delete set null,
  released_at timestamptz,
  released_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bed_blocks_tenant_id_id_key unique (tenant_id, id),
  constraint bed_blocks_bed_fk foreign key (tenant_id, bed_id)
    references public.beds (tenant_id, id) on delete restrict,
  constraint bed_blocks_blocked_bounded check (
    not isempty(blocked) and lower(blocked) is not null and upper(blocked) is not null
  ),
  constraint bed_blocks_reason_length check (char_length(btrim(reason)) between 3 and 500),
  -- One live block per bed per day.
  constraint bed_blocks_no_overlap exclude using gist (
    bed_id extensions.gist_uuid_ops with =,
    blocked with &&
  ) where (released_at is null)
);

create index bed_blocks_tenant_bed_idx on public.bed_blocks (tenant_id, bed_id);

-- created_by / released_by come from the session, never from input; released blocks are frozen.
create function app.bed_blocks_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.released_by := null;
    if new.released_at is not null then
      raise exception 'a new bed block cannot already be released' using errcode = '23514';
    end if;
    return new;
  end if;

  if old.released_at is not null then
    raise exception 'a released bed block cannot be changed' using errcode = '23514';
  end if;
  new.created_by := old.created_by;
  if new.released_at is not null then
    new.released_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger bed_blocks_stamp before insert or update on public.bed_blocks
  for each row execute function app.bed_blocks_stamp();

-- ---------------------------------------------------------------------------------------------
-- room_type_prices: price per room type and period; snapshotted into booking requests (Phase 3)
-- ---------------------------------------------------------------------------------------------
create table public.room_type_prices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  room_type_id uuid not null,
  booking_period_id uuid not null,
  amount_minor bigint not null,
  deposit_minor bigint not null default 0,
  currency char(3) not null default 'GHS',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint room_type_prices_tenant_id_id_key unique (tenant_id, id),
  constraint room_type_prices_type_period_key unique (tenant_id, room_type_id, booking_period_id),
  constraint room_type_prices_room_type_fk foreign key (tenant_id, room_type_id)
    references public.room_types (tenant_id, id) on delete cascade,
  constraint room_type_prices_period_fk foreign key (tenant_id, booking_period_id)
    references public.booking_periods (tenant_id, id) on delete cascade,
  -- Pesewas; upper bound GH₵ 1,000,000 catches unit mistakes (cedis typed as pesewas x100).
  constraint room_type_prices_amount_range check (amount_minor > 0 and amount_minor <= 100000000),
  constraint room_type_prices_deposit_range check (deposit_minor >= 0 and deposit_minor <= amount_minor),
  constraint room_type_prices_currency_check check (currency = 'GHS')
);

create index room_type_prices_period_idx on public.room_type_prices (tenant_id, booking_period_id);

-- ---------------------------------------------------------------------------------------------
-- Occupancy: a room never has more (non-retired) beds than its room type's occupancy.
-- SECURITY DEFINER so the count sees every bed, whatever the caller may read; the room row is
-- locked so two concurrent inserts cannot both squeeze in.
-- ---------------------------------------------------------------------------------------------
create function app.enforce_room_occupancy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_occupancy smallint;
  v_beds integer;
  v_max integer;
begin
  if tg_table_name = 'beds' then
    if new.status = 'retired' then
      return new;
    end if;
    if tg_op = 'UPDATE' and old.room_id = new.room_id and old.status <> 'retired' then
      return new;
    end if;

    select rt.occupancy into v_occupancy
    from public.rooms r join public.room_types rt on rt.tenant_id = r.tenant_id and rt.id = r.room_type_id
    where r.tenant_id = new.tenant_id and r.id = new.room_id
    for update of r;

    select count(*) into v_beds
    from public.beds b
    where b.tenant_id = new.tenant_id and b.room_id = new.room_id and b.status <> 'retired' and b.id <> new.id;

    if v_occupancy is not null and v_beds + 1 > v_occupancy then
      raise exception 'room already has % bed(s), the most its room type allows', v_occupancy
        using errcode = '23514', hint = 'Retire a bed or change the room type first.';
    end if;
    return new;
  end if;

  if tg_table_name = 'rooms' then
    select rt.occupancy into v_occupancy
    from public.room_types rt where rt.tenant_id = new.tenant_id and rt.id = new.room_type_id;
    select count(*) into v_beds
    from public.beds b where b.tenant_id = new.tenant_id and b.room_id = new.id and b.status <> 'retired';
    if v_beds > v_occupancy then
      raise exception 'room has % bed(s); the new room type allows %', v_beds, v_occupancy using errcode = '23514';
    end if;
    return new;
  end if;

  -- room_types: occupancy lowered
  select max(c.n) into v_max
  from (
    select count(*) as n
    from public.rooms r join public.beds b on b.tenant_id = r.tenant_id and b.room_id = r.id
    where r.tenant_id = new.tenant_id and r.room_type_id = new.id and b.status <> 'retired'
    group by r.id
  ) c;
  if coalesce(v_max, 0) > new.occupancy then
    raise exception 'a room of this type has % bed(s); occupancy cannot be lower', v_max using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger beds_enforce_room_occupancy before insert or update of room_id, status on public.beds
  for each row execute function app.enforce_room_occupancy();
create trigger rooms_enforce_room_occupancy before update of room_type_id on public.rooms
  for each row when (old.room_type_id is distinct from new.room_type_id)
  execute function app.enforce_room_occupancy();
create trigger room_types_enforce_room_occupancy before update of occupancy on public.room_types
  for each row when (new.occupancy < old.occupancy)
  execute function app.enforce_room_occupancy();

-- ---------------------------------------------------------------------------------------------
-- updated_at and audit
-- ---------------------------------------------------------------------------------------------
create trigger booking_periods_set_updated_at before update on public.booking_periods
  for each row execute function app.set_updated_at();
create trigger room_types_set_updated_at before update on public.room_types
  for each row execute function app.set_updated_at();
create trigger room_type_photos_set_updated_at before update on public.room_type_photos
  for each row execute function app.set_updated_at();
create trigger rooms_set_updated_at before update on public.rooms
  for each row execute function app.set_updated_at();
create trigger beds_set_updated_at before update on public.beds
  for each row execute function app.set_updated_at();
create trigger bed_blocks_set_updated_at before update on public.bed_blocks
  for each row execute function app.set_updated_at();
create trigger room_type_prices_set_updated_at before update on public.room_type_prices
  for each row execute function app.set_updated_at();

create trigger booking_periods_audit after insert or update or delete on public.booking_periods
  for each row execute function app.audit_row_change();
create trigger room_types_audit after insert or update or delete on public.room_types
  for each row execute function app.audit_row_change();
create trigger room_type_photos_audit after insert or update or delete on public.room_type_photos
  for each row execute function app.audit_row_change();
create trigger rooms_audit after insert or update or delete on public.rooms
  for each row execute function app.audit_row_change();
create trigger beds_audit after insert or update or delete on public.beds
  for each row execute function app.audit_row_change();
create trigger bed_blocks_audit after insert or update or delete on public.bed_blocks
  for each row execute function app.audit_row_change();
create trigger room_type_prices_audit after insert or update or delete on public.room_type_prices
  for each row execute function app.audit_row_change();

-- ---------------------------------------------------------------------------------------------
-- Row level security (enabled and forced; deny by default)
-- ---------------------------------------------------------------------------------------------
alter table public.booking_periods enable row level security;
alter table public.booking_periods force row level security;
alter table public.room_types enable row level security;
alter table public.room_types force row level security;
alter table public.room_type_photos enable row level security;
alter table public.room_type_photos force row level security;
alter table public.rooms enable row level security;
alter table public.rooms force row level security;
alter table public.beds enable row level security;
alter table public.beds force row level security;
alter table public.bed_blocks enable row level security;
alter table public.bed_blocks force row level security;
alter table public.room_type_prices enable row level security;
alter table public.room_type_prices force row level security;

revoke all on public.booking_periods, public.room_types, public.room_type_photos, public.rooms,
  public.beds, public.bed_blocks, public.room_type_prices
  from anon, authenticated;

-- booking_periods: public when open/closed in an active hostel; every member reads; inventory.manage writes.
grant select on public.booking_periods to anon, authenticated;
grant insert (tenant_id, name, kind, starts_on, ends_on, booking_opens_at, booking_closes_at, status)
  on public.booking_periods to authenticated;
grant update (name, kind, starts_on, ends_on, booking_opens_at, booking_closes_at, status)
  on public.booking_periods to authenticated;
grant delete on public.booking_periods to authenticated;

create policy booking_periods_select_public on public.booking_periods for select to anon, authenticated
  using (status in ('open', 'closed') and app.tenant_is_active(tenant_id));
create policy booking_periods_select_member on public.booking_periods for select to authenticated
  using (app.is_tenant_member(tenant_id) or app.has_break_glass(tenant_id));
create policy booking_periods_insert on public.booking_periods for insert to authenticated
  with check (app.has_permission(tenant_id, 'inventory.manage'));
create policy booking_periods_update on public.booking_periods for update to authenticated
  using (app.has_permission(tenant_id, 'inventory.manage'))
  with check (app.has_permission(tenant_id, 'inventory.manage'));
create policy booking_periods_delete on public.booking_periods for delete to authenticated
  using (app.has_permission(tenant_id, 'inventory.manage'));

-- room_types
grant select on public.room_types to anon, authenticated;
grant insert (tenant_id, name, slug, description, occupancy, gender_policy, amenities, is_published, sort_order)
  on public.room_types to authenticated;
grant update (name, slug, description, occupancy, gender_policy, amenities, is_published, sort_order)
  on public.room_types to authenticated;
grant delete on public.room_types to authenticated;

create policy room_types_select_public on public.room_types for select to anon, authenticated
  using (is_published and app.tenant_is_active(tenant_id));
create policy room_types_select_member on public.room_types for select to authenticated
  using (app.is_tenant_member(tenant_id) or app.has_break_glass(tenant_id));
create policy room_types_insert on public.room_types for insert to authenticated
  with check (app.has_permission(tenant_id, 'inventory.manage'));
create policy room_types_update on public.room_types for update to authenticated
  using (app.has_permission(tenant_id, 'inventory.manage'))
  with check (app.has_permission(tenant_id, 'inventory.manage'));
create policy room_types_delete on public.room_types for delete to authenticated
  using (app.has_permission(tenant_id, 'inventory.manage'));

-- room_type_photos: public with their published room type
grant select on public.room_type_photos to anon, authenticated;
grant insert (tenant_id, room_type_id, storage_path, alt_text, sort_order) on public.room_type_photos to authenticated;
grant update (alt_text, sort_order) on public.room_type_photos to authenticated;
grant delete on public.room_type_photos to authenticated;

create policy room_type_photos_select_public on public.room_type_photos for select to anon, authenticated
  using (exists (
    select 1 from public.room_types rt
    where rt.tenant_id = room_type_photos.tenant_id and rt.id = room_type_photos.room_type_id
      and rt.is_published and app.tenant_is_active(rt.tenant_id)
  ));
create policy room_type_photos_select_member on public.room_type_photos for select to authenticated
  using (app.is_tenant_member(tenant_id) or app.has_break_glass(tenant_id));
create policy room_type_photos_insert on public.room_type_photos for insert to authenticated
  with check (app.has_permission(tenant_id, 'inventory.manage'));
create policy room_type_photos_update on public.room_type_photos for update to authenticated
  using (app.has_permission(tenant_id, 'inventory.manage'))
  with check (app.has_permission(tenant_id, 'inventory.manage'));
create policy room_type_photos_delete on public.room_type_photos for delete to authenticated
  using (app.has_permission(tenant_id, 'inventory.manage'));

-- rooms: staff with inventory.read (or .manage); never public
grant select on public.rooms to authenticated;
grant insert (tenant_id, room_type_id, label, block, floor, gender_policy_override, status, notes)
  on public.rooms to authenticated;
grant update (room_type_id, label, block, floor, gender_policy_override, status, notes) on public.rooms to authenticated;
grant delete on public.rooms to authenticated;

create policy rooms_select on public.rooms for select to authenticated
  using (
    app.has_permission(tenant_id, 'inventory.read')
    or app.has_permission(tenant_id, 'inventory.manage')
    or app.has_break_glass(tenant_id)
  );
create policy rooms_insert on public.rooms for insert to authenticated
  with check (app.has_permission(tenant_id, 'inventory.manage'));
create policy rooms_update on public.rooms for update to authenticated
  using (app.has_permission(tenant_id, 'inventory.manage'))
  with check (app.has_permission(tenant_id, 'inventory.manage'));
create policy rooms_delete on public.rooms for delete to authenticated
  using (app.has_permission(tenant_id, 'inventory.manage'));

-- beds
grant select on public.beds to authenticated;
grant insert (tenant_id, room_id, label, status) on public.beds to authenticated;
grant update (room_id, label, status) on public.beds to authenticated;
grant delete on public.beds to authenticated;

create policy beds_select on public.beds for select to authenticated
  using (
    app.has_permission(tenant_id, 'inventory.read')
    or app.has_permission(tenant_id, 'inventory.manage')
    or app.has_break_glass(tenant_id)
  );
create policy beds_insert on public.beds for insert to authenticated
  with check (app.has_permission(tenant_id, 'inventory.manage'));
create policy beds_update on public.beds for update to authenticated
  using (app.has_permission(tenant_id, 'inventory.manage'))
  with check (app.has_permission(tenant_id, 'inventory.manage'));
create policy beds_delete on public.beds for delete to authenticated
  using (app.has_permission(tenant_id, 'inventory.manage'));

-- bed_blocks: no delete (history); release by setting released_at
grant select on public.bed_blocks to authenticated;
grant insert (tenant_id, bed_id, blocked, reason) on public.bed_blocks to authenticated;
grant update (blocked, reason, released_at) on public.bed_blocks to authenticated;

create policy bed_blocks_select on public.bed_blocks for select to authenticated
  using (
    app.has_permission(tenant_id, 'inventory.read')
    or app.has_permission(tenant_id, 'inventory.manage')
    or app.has_break_glass(tenant_id)
  );
create policy bed_blocks_insert on public.bed_blocks for insert to authenticated
  with check (app.has_permission(tenant_id, 'inventory.manage'));
create policy bed_blocks_update on public.bed_blocks for update to authenticated
  using (app.has_permission(tenant_id, 'inventory.manage'))
  with check (app.has_permission(tenant_id, 'inventory.manage'));

-- room_type_prices: public for a published room type in an open period; pricing.manage writes
grant select on public.room_type_prices to anon, authenticated;
grant insert (tenant_id, room_type_id, booking_period_id, amount_minor, deposit_minor, currency)
  on public.room_type_prices to authenticated;
grant update (amount_minor, deposit_minor) on public.room_type_prices to authenticated;
grant delete on public.room_type_prices to authenticated;

create policy room_type_prices_select_public on public.room_type_prices for select to anon, authenticated
  using (
    app.tenant_is_active(tenant_id)
    and exists (
      select 1 from public.room_types rt
      where rt.tenant_id = room_type_prices.tenant_id and rt.id = room_type_prices.room_type_id and rt.is_published
    )
    and exists (
      select 1 from public.booking_periods bp
      where bp.tenant_id = room_type_prices.tenant_id and bp.id = room_type_prices.booking_period_id
        and bp.status = 'open'
    )
  );
create policy room_type_prices_select_member on public.room_type_prices for select to authenticated
  using (app.is_tenant_member(tenant_id) or app.has_break_glass(tenant_id));
create policy room_type_prices_insert on public.room_type_prices for insert to authenticated
  with check (app.has_permission(tenant_id, 'pricing.manage'));
create policy room_type_prices_update on public.room_type_prices for update to authenticated
  using (app.has_permission(tenant_id, 'pricing.manage'))
  with check (app.has_permission(tenant_id, 'pricing.manage'));
create policy room_type_prices_delete on public.room_type_prices for delete to authenticated
  using (app.has_permission(tenant_id, 'pricing.manage'));

-- Postgres grants EXECUTE on new functions to PUBLIC; trigger functions are never called directly.
revoke execute on all functions in schema app from public;
