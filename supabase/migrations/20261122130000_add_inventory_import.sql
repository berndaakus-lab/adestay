-- Phase 2, task 9. All-or-nothing import of rooms and beds (one input row per room).
-- Design: docs/IMPLEMENTATION_PLAN.md Phase 2 scope and criterion 2; docs/DATABASE_DESIGN.md §4.3;
--         docs/RBAC_MATRIX.md (inventory.manage); product-owner decision 2026-11-14 (≤ 500 rows,
--         preview before commit).
--
-- The server parses the CSV; this function is the authority on the content. With p_dry_run it
-- validates and writes nothing. Otherwise it validates everything first and writes only if the
-- whole file is valid. Imports only add: an existing room number is an error, never an update.
-- Labels are limited to letters, digits and . _ / - or spaces, which also rules out spreadsheet
-- formulas (=, +, @) coming back out of later exports.

create function app.import_label_ok(p_value text, p_max integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_value is not null
     and char_length(p_value) <= p_max
     and p_value ~ '^[A-Za-z0-9]([A-Za-z0-9 ._/-]*[A-Za-z0-9])?$'
$$;

create function app.import_issue(p_line integer, p_field text, p_message text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('line', p_line, 'field', p_field, 'message', p_message)
$$;

create function public.import_inventory(p_tenant_id uuid, p_rows jsonb, p_dry_run boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_index bigint;
  v_line integer;
  v_type_text text;
  v_type_id uuid;
  v_type_name text;
  v_occupancy smallint;
  v_matches integer;
  v_room text;
  v_block text;
  v_floor text;
  v_beds text[];
  v_seen text[] := '{}';
  v_plan jsonb[] := '{}';
  v_item jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_summary jsonb;
  v_room_id uuid;
  v_bed text;
  v_rooms integer := 0;
  v_bed_total integer := 0;
begin
  if not app.has_permission(p_tenant_id, 'inventory.manage') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 1 and 500 then
    raise exception 'an import needs 1 to 500 rows' using errcode = '22023';
  end if;

  -- A real import is serialised per hostel, so two imports cannot both pass validation.
  if not coalesce(p_dry_run, true) then
    perform 1 from public.tenants t where t.id = p_tenant_id for update;
  end if;

  for v_row, v_index in select e.value, e.ordinality from jsonb_array_elements(p_rows) with ordinality e loop
    if jsonb_typeof(v_row) <> 'object' then
      raise exception 'each row must be an object' using errcode = '22023';
    end if;
    v_line := case when coalesce(v_row ->> 'line', '') ~ '^[0-9]{1,6}$' then (v_row ->> 'line')::integer else v_index::integer end;

    -- Room type: its slug, or its name when exactly one type has that name.
    v_type_text := btrim(coalesce(v_row ->> 'room_type', ''));
    v_type_id := null;
    v_occupancy := null;
    select rt.id, rt.name, rt.occupancy into v_type_id, v_type_name, v_occupancy
    from public.room_types rt
    where rt.tenant_id = p_tenant_id and lower(rt.slug::text) = lower(v_type_text);
    if v_type_id is null then
      select count(*) into v_matches
      from public.room_types rt
      where rt.tenant_id = p_tenant_id and lower(rt.name) = lower(v_type_text);
      if v_matches = 1 then
        select rt.id, rt.name, rt.occupancy into v_type_id, v_type_name, v_occupancy
        from public.room_types rt
        where rt.tenant_id = p_tenant_id and lower(rt.name) = lower(v_type_text);
      elsif v_matches > 1 then
        v_errors := v_errors || app.import_issue(v_line, 'room_type', 'Several room types have this name. Use the room type''s web address (slug).');
      else
        v_errors := v_errors || app.import_issue(v_line, 'room_type', 'No room type with this name. Add it first.');
      end if;
    end if;

    v_room := btrim(coalesce(v_row ->> 'room', ''));
    if not app.import_label_ok(v_room, 20) then
      v_errors := v_errors || app.import_issue(v_line, 'room', 'Use up to 20 letters, numbers, spaces or . _ / -');
    elsif lower(v_room) = any (v_seen) then
      v_errors := v_errors || app.import_issue(v_line, 'room', 'This room appears more than once in the file.');
    elsif exists (select 1 from public.rooms r where r.tenant_id = p_tenant_id and lower(r.label) = lower(v_room)) then
      v_errors := v_errors || app.import_issue(v_line, 'room', 'This room already exists.');
    end if;
    v_seen := v_seen || lower(v_room);

    v_block := nullif(btrim(coalesce(v_row ->> 'block', '')), '');
    if v_block is not null and not app.import_label_ok(v_block, 40) then
      v_errors := v_errors || app.import_issue(v_line, 'block', 'Use up to 40 letters, numbers, spaces or . _ / -');
    end if;
    v_floor := nullif(btrim(coalesce(v_row ->> 'floor', '')), '');
    if v_floor is not null and not app.import_label_ok(v_floor, 20) then
      v_errors := v_errors || app.import_issue(v_line, 'floor', 'Use up to 20 letters, numbers, spaces or . _ / -');
    end if;

    v_beds := null;
    if jsonb_typeof(v_row -> 'beds') is distinct from 'array'
       or jsonb_array_length(v_row -> 'beds') = 0
       or jsonb_array_length(v_row -> 'beds') > 12
       or exists (select 1 from jsonb_array_elements(v_row -> 'beds') b where jsonb_typeof(b) <> 'string') then
      v_errors := v_errors || app.import_issue(v_line, 'beds', 'Give a number of beds (1-12) or bed labels like A;B.');
    else
      select array_agg(btrim(b)) into v_beds from jsonb_array_elements_text(v_row -> 'beds') b;
      if exists (select 1 from unnest(v_beds) b where not app.import_label_ok(b, 10)) then
        v_errors := v_errors || app.import_issue(v_line, 'beds', 'Bed labels can have up to 10 letters, numbers, spaces or . _ / -');
      elsif (select count(distinct lower(b)) from unnest(v_beds) b) <> cardinality(v_beds) then
        v_errors := v_errors || app.import_issue(v_line, 'beds', 'The same bed label appears twice in this room.');
      elsif v_occupancy is not null and cardinality(v_beds) > v_occupancy then
        v_errors := v_errors || app.import_issue(v_line, 'beds', format('This room type allows %s bed(s) per room.', v_occupancy));
      end if;
    end if;

    if v_type_id is not null and v_beds is not null then
      v_plan := v_plan || jsonb_build_object(
        'type_id', v_type_id, 'type_name', v_type_name, 'room', v_room, 'block', v_block, 'floor', v_floor, 'beds', to_jsonb(v_beds)
      );
    end if;
  end loop;

  if jsonb_array_length(v_errors) > 0 then
    return jsonb_build_object(
      'ok', false,
      'dry_run', coalesce(p_dry_run, true),
      'rooms', 0,
      'beds', 0,
      'by_type', '[]'::jsonb,
      'error_count', jsonb_array_length(v_errors),
      'errors', (select jsonb_agg(e.value order by e.ordinality)
                 from jsonb_array_elements(v_errors) with ordinality e where e.ordinality <= 50)
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('room_type', s.name, 'rooms', s.rooms, 'beds', s.beds) order by s.name), '[]'::jsonb),
         coalesce(sum(s.rooms), 0)::integer, coalesce(sum(s.beds), 0)::integer
    into v_summary, v_rooms, v_bed_total
  from (
    select p ->> 'type_id' as id, p ->> 'type_name' as name, count(*)::integer as rooms,
           sum(jsonb_array_length(p -> 'beds'))::integer as beds
    from unnest(v_plan) p
    group by 1, 2
  ) s;

  if not coalesce(p_dry_run, true) then
    foreach v_item in array v_plan loop
      insert into public.rooms (tenant_id, room_type_id, label, block, floor)
      values (p_tenant_id, (v_item ->> 'type_id')::uuid, v_item ->> 'room', v_item ->> 'block', v_item ->> 'floor')
      returning id into v_room_id;
      for v_bed in select b from jsonb_array_elements_text(v_item -> 'beds') b loop
        insert into public.beds (tenant_id, room_id, label) values (p_tenant_id, v_room_id, v_bed);
      end loop;
    end loop;

    perform app.write_audit(
      p_tenant_id, 'inventory.imported', 'tenants', p_tenant_id::text, null,
      jsonb_build_object('rooms', v_rooms, 'beds', v_bed_total)
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'dry_run', coalesce(p_dry_run, true),
    'rooms', v_rooms,
    'beds', v_bed_total,
    'by_type', v_summary,
    'error_count', 0,
    'errors', '[]'::jsonb
  );
end;
$$;

revoke execute on function public.import_inventory(uuid, jsonb, boolean) from public, anon;
grant execute on function public.import_inventory(uuid, jsonb, boolean) to authenticated, service_role;

revoke execute on all functions in schema app from public;
