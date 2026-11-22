-- Phase 2, task 14. The whole journey on the real schema, RPCs and RLS, as the API roles:
-- platform onboarding -> first admin -> 50 beds by import -> capacity -> suspension -> restore
-- (docs/IMPLEMENTATION_PLAN.md Phase 2 acceptance criteria 1, 2, 3, 5 and 6, database part).
begin;
select plan(32);

create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.as_user(p_user uuid, p_aal text default 'aal1') returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true);
  execute 'set local role authenticated';
end $$;

create function tests.as_anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  execute 'set local role anon';
end $$;

create function tests.as_owner() returns void
language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

create function tests.tid() returns uuid
language sql security definer as $$ select id from public.tenants where slug = 'accept-hostel' $$;

-- Capacity for one room type and period as "total/out of service/blocked/sellable".
create function tests.cap(p_type text, p_period text) returns text
language sql as $$
  select c.total_beds || '/' || c.out_of_service_beds || '/' || c.blocked_beds || '/' || c.sellable_beds
  from public.room_type_capacity(tests.tid()) c
  join public.room_types rt on rt.id = c.room_type_id
  join public.booking_periods bp on bp.id = c.booking_period_id
  where rt.slug = p_type and bp.name = p_period
$$;

grant execute on all functions in schema tests to anon, authenticated;

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000e1', 'platform@adestay.test', now()),
  ('00000000-0000-4000-8000-0000000000a1', 'owner@accept.test', now()),
  ('00000000-0000-4000-8000-0000000000a2', 'desk@accept.test', now()),
  ('00000000-0000-4000-8000-0000000000b1', 'admin@other.test', now());
insert into public.platform_admins (user_id) values ('00000000-0000-4000-8000-0000000000e1');
insert into public.tenants (id, slug, name, reference_prefix, status) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'other-hostel', 'Other Hostel', 'OH', 'active');
insert into public.tenant_memberships (tenant_id, user_id, role, status) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-4000-8000-0000000000b1', 'hostel_admin', 'active');

-- ---------------------------------------------------------------------------------------------
-- Schema facts the screens rely on: one foreign key per embedded read, so PostgREST can embed
-- rooms -> beds and beds -> bed_blocks without an ambiguity error.
-- ---------------------------------------------------------------------------------------------
select is((select count(*)::int from pg_constraint where contype = 'f' and conrelid = 'public.beds'::regclass and confrelid = 'public.rooms'::regclass), 1,
  'exactly one foreign key from beds to rooms');
select is((select count(*)::int from pg_constraint where contype = 'f' and conrelid = 'public.bed_blocks'::regclass and confrelid = 'public.beds'::regclass), 1,
  'exactly one foreign key from bed_blocks to beds');

-- ---------------------------------------------------------------------------------------------
-- Criterion 1: onboarding
-- ---------------------------------------------------------------------------------------------
select tests.as_user('00000000-0000-4000-8000-0000000000e1', 'aal2');
select isnt(public.create_tenant('accept-hostel', 'Accept Hostel', 'ACC', 'adestay.test', 'Owner@Accept.test'), null, 'platform admin creates the hostel');
select is((select slug from app.resolve_tenant_by_host('accept-hostel.adestay.test')), 'accept-hostel', 'the subdomain resolves');
select is((select email || ' ' || status from public.platform_hostel_admin_invitations(tests.tid())), 'owner@accept.test invited', 'the first admin is invited');
select lives_ok($$select public.set_tenant_status(tests.tid(), 'active', 'Onboarding complete')$$, 'platform admin activates it');
select tests.as_owner();

select tests.as_user('00000000-0000-4000-8000-0000000000a1', 'aal1');
select is(public.accept_my_invitations(), 1, 'the admin accepts at first sign-in');
select ok(not app.has_permission(tests.tid(), 'inventory.manage'), 'without MFA the new admin has no access yet');
select is((select array_agg(role) from public.my_memberships()), array['hostel_admin'], 'but the app can see they must set up MFA');
select tests.as_owner();

-- ---------------------------------------------------------------------------------------------
-- Criterion 3: branding, with the admin's session
-- ---------------------------------------------------------------------------------------------
select tests.as_user('00000000-0000-4000-8000-0000000000a1', 'aal2');
select throws_ok($$update public.tenant_profiles set primary_color = '#b69a61' where tenant_id = tests.tid()$$, '23514', null, 'a low-contrast brand colour is refused');
select lives_ok($$update public.tenant_profiles set primary_color = '#234536', is_published = true where tenant_id = tests.tid()$$, 'a readable colour saves and the site publishes');

-- ---------------------------------------------------------------------------------------------
-- Criterion 2: 50 beds through the real import, then real capacity
-- ---------------------------------------------------------------------------------------------
insert into public.booking_periods (tenant_id, name, kind, starts_on, ends_on, status) values
  (tests.tid(), 'Year', 'academic_year', '2026-09-01', '2027-07-31', 'open'),
  (tests.tid(), 'Vacation', 'vacation', '2027-08-01', '2027-08-31', 'draft');
insert into public.room_types (tenant_id, name, slug, occupancy, is_published) values
  (tests.tid(), 'Single', 'single', 1, true),
  (tests.tid(), '2 in a room', 'two', 2, true),
  (tests.tid(), '4 in a room', 'four', 4, true);

create temporary table import_file on commit drop as
select jsonb_agg(x) as rows from (
  select jsonb_build_object('line', g + 1, 'room_type', 'Single', 'room', 'S-' || g, 'block', 'S', 'floor', '1', 'beds', array['A']) as x from generate_series(1, 2) g
  union all select jsonb_build_object('line', g + 3, 'room_type', 'two', 'room', 'T-' || g, 'block', 'T', 'floor', '2', 'beds', array['A', 'B']) from generate_series(1, 10) g
  union all select jsonb_build_object('line', g + 13, 'room_type', '4 IN A ROOM', 'room', 'F-' || g, 'block', 'F', 'floor', '3', 'beds', array['A', 'B', 'C', 'D']) from generate_series(1, 7) g
) s;
grant select on import_file to authenticated;

select is((select r ->> 'rooms' from public.import_inventory(tests.tid(), (select rows from import_file), true) r), '19', 'the preview counts 19 rooms');
select is((select count(*)::int from public.beds where tenant_id = tests.tid()), 0, 'the preview writes nothing');
select is((select (r ->> 'rooms') || '/' || (r ->> 'beds') from public.import_inventory(tests.tid(), (select rows from import_file), false) r), '19/50', 'the import adds 19 rooms and 50 beds');
select is((select count(*)::int from public.beds where tenant_id = tests.tid()), 50, 'all 50 beds exist');
select is((select (r ->> 'ok') from public.import_inventory(tests.tid(), (select rows from import_file), false) r), 'false', 'importing the same file again is refused');
select is((select count(*)::int from public.beds where tenant_id = tests.tid()), 50, 'and adds nothing');

select is(tests.cap('single', 'Year') || ' ' || tests.cap('two', 'Year') || ' ' || tests.cap('four', 'Year'), '2/0/0/2 20/0/0/20 28/0/0/28', 'capacity right after import');

update public.beds set status = 'maintenance'
  where tenant_id = tests.tid() and label = 'B' and room_id = (select id from public.rooms where tenant_id = tests.tid() and label = 'T-1');
update public.rooms set status = 'retired' where tenant_id = tests.tid() and label = 'F-7';
insert into public.bed_blocks (tenant_id, bed_id, blocked, reason)
select b.tenant_id, b.id, '[2026-10-01,2026-10-15]'::daterange, 'Ceiling leak'
from public.beds b join public.rooms r on r.id = b.room_id
where r.tenant_id = tests.tid() and r.label = 'F-1' and b.label = 'A';

select is(tests.cap('two', 'Year'), '20/1/0/19', 'a bed in maintenance is out of service');
select is(tests.cap('four', 'Year'), '24/0/1/23', 'a retired room is gone and a blocked bed is not sellable');
select is(tests.cap('four', 'Vacation'), '24/0/0/24', 'the block does not touch another period');
select is((select sum(c.sellable_beds)::int from public.room_type_capacity(tests.tid()) c
           join public.booking_periods bp on bp.id = c.booking_period_id where bp.name = 'Year'), 44, 'sellable beds for the year: 2 + 19 + 23');

insert into public.room_type_prices (tenant_id, room_type_id, booking_period_id, amount_minor, deposit_minor)
select tests.tid(), rt.id, bp.id, 450000, 100000
from public.room_types rt, public.booking_periods bp
where rt.tenant_id = tests.tid() and bp.tenant_id = tests.tid() and bp.name = 'Year';
select tests.as_owner();

-- ---------------------------------------------------------------------------------------------
-- Criterion 6: another hostel and the public see only what they should
-- ---------------------------------------------------------------------------------------------
select tests.as_user('00000000-0000-4000-8000-0000000000b1', 'aal2');
select is((select count(*)::int from public.rooms where tenant_id = tests.tid()), 0, 'another hostel''s admin sees none of its rooms');
select is((select count(*)::int from public.room_type_capacity(tests.tid())), 0, 'nor its capacity');
select throws_ok($$select public.import_inventory(tests.tid(), '[{"room_type":"two","room":"Z-1","beds":["A"]}]'::jsonb, false)$$, '42501', null, 'nor can import into it');
select tests.as_owner();

select tests.as_anon();
select is((select count(*)::int from public.room_type_prices where tenant_id = tests.tid()), 3, 'visitors see prices of the open period');
select throws_ok('select id from public.rooms', '42501', null, 'visitors cannot read room numbers');
select tests.as_owner();

-- ---------------------------------------------------------------------------------------------
-- Criterion 5: suspension and restore
-- ---------------------------------------------------------------------------------------------
select tests.as_user('00000000-0000-4000-8000-0000000000e1', 'aal2');
select lives_ok($$select public.set_tenant_status(tests.tid(), 'suspended', 'Subscription unpaid')$$, 'platform admin suspends the hostel');
select tests.as_owner();

select tests.as_user('00000000-0000-4000-8000-0000000000a1', 'aal2');
select is((select count(*)::int from public.rooms where tenant_id = tests.tid()), 0, 'suspended: staff are denied');
select tests.as_owner();

select tests.as_anon();
select is((select status from app.resolve_tenant_by_host('accept-hostel.adestay.test')) || ' ' ||
          (select count(*)::text from public.room_types where tenant_id = tests.tid()), 'suspended 0',
  'suspended: the site resolves as suspended and shows no rooms');
select tests.as_owner();

select tests.as_user('00000000-0000-4000-8000-0000000000e1', 'aal2');
select lives_ok($$select public.set_tenant_status(tests.tid(), 'active', 'Payment received')$$, 'platform admin restores it');
select tests.as_owner();

select tests.as_user('00000000-0000-4000-8000-0000000000a1', 'aal2');
select is((select count(*)::int from public.rooms where tenant_id = tests.tid()), 19, 'restored: staff have their data back');
select tests.as_owner();

select * from finish();
rollback;
