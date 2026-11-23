-- Phase 3, task 14. public.room_type_public_offers: public prices and quoted deposits, no counts.
begin;
select plan(14);

create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.as_anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  execute 'set local role anon';
end $$;
grant execute on function tests.as_anon() to anon, authenticated;

insert into public.tenants (id, slug, name, reference_prefix, status, suspended_at, suspension_reason)
select (repeat(c, 8) || '-' || repeat(c, 4) || '-4' || repeat(c, 3) || '-8' || repeat(c, 3) || '-' || repeat(c, 12))::uuid,
       'hostel-' || c, 'Hostel ' || c, 'H' || upper(c), s, case when s = 'suspended' then now() end, case when s = 'suspended' then 'Unpaid' end
from (values ('a', 'active'), ('b', 'active'), ('c', 'active'), ('d', 'active'), ('e', 'suspended'), ('f', 'active')) v(c, s);

insert into public.tenant_profiles (tenant_id, display_name, is_published)
select id, name, slug <> 'hostel-f' from public.tenants;

insert into public.tenant_settings (tenant_id, deposit_policy, deposit_value)
select id, p, v from public.tenants t
join (values ('hostel-a', 'fixed', 59000), ('hostel-b', 'percent', 30), ('hostel-c', 'none', 0), ('hostel-d', 'full', 0),
             ('hostel-e', 'none', 0), ('hostel-f', 'none', 0)) x(slug, p, v) on x.slug = t.slug::text;

insert into public.booking_periods (tenant_id, name, kind, starts_on, ends_on, status)
select id, 'Year', 'academic_year', '2040-09-01', '2041-07-31', 'open' from public.tenants;
insert into public.booking_periods (tenant_id, name, kind, starts_on, ends_on, status)
select id, 'Draft', 'semester', '2042-01-01', '2042-05-31', 'draft' from public.tenants where slug = 'hostel-a';

insert into public.room_types (tenant_id, name, slug, occupancy, is_published)
select id, 'Room', 'room', 5, true from public.tenants;
insert into public.room_types (tenant_id, name, slug, occupancy, is_published)
select id, 'Hidden', 'hidden', 1, false from public.tenants where slug = 'hostel-a';

insert into public.rooms (tenant_id, room_type_id, label)
select rt.tenant_id, rt.id, 'R-1' from public.room_types rt where rt.slug = 'room';
insert into public.beds (tenant_id, room_id, label)
select r.tenant_id, r.id, 'B' || n from public.rooms r, generate_series(1, 5) n;

insert into public.room_type_prices (tenant_id, room_type_id, booking_period_id, amount_minor, deposit_minor)
select rt.tenant_id, rt.id, bp.id, 450000, 100000
from public.room_types rt join public.booking_periods bp on bp.tenant_id = rt.tenant_id;

select ok(has_function_privilege('anon', 'public.room_type_public_offers(uuid)', 'execute'), 'visitors can read offers');
select is((select count(*)::int from pg_proc p, unnest(p.proargnames) arg
           where p.oid = 'public.room_type_public_offers(uuid)'::regprocedure
             and arg in ('sellable_beds', 'reserved_beds', 'remaining_beds', 'deposit_policy', 'deposit_value')),
  0, 'offers expose no bed counts or private settings');

select tests.as_anon();
select is((select count(*)::int from public.room_type_public_offers('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')), 1, 'only the bookable offer is listed');
select is((select period_name || '|' || period_kind || '|' || starts_on || '|' || ends_on from public.room_type_public_offers('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')),
  'Year|academic_year|2040-09-01|2041-07-31', 'the period is described');
select is((select amount_minor from public.room_type_public_offers('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')), 450000::bigint, 'the price is shown');
select is((select availability from public.room_type_public_offers('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')), 'available', 'availability is an indicator');
select is((select deposit_minor from public.room_type_public_offers('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')), 100000::bigint, 'fixed: the room price deposit');
select is((select deposit_minor from public.room_type_public_offers('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')), 135000::bigint, 'percent: a share of the price');
select is((select deposit_minor from public.room_type_public_offers('cccccccc-cccc-4ccc-8ccc-cccccccccccc')), 0::bigint, 'none: no deposit');
select is((select deposit_minor from public.room_type_public_offers('dddddddd-dddd-4ddd-8ddd-dddddddddddd')), 450000::bigint, 'full: the whole price');
select is((select count(*)::int from public.room_type_public_offers('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')), 0, 'a suspended hostel lists nothing');
select is((select count(*)::int from public.room_type_public_offers('ffffffff-ffff-4fff-8fff-ffffffffffff')), 0, 'an unpublished hostel lists nothing');
select is((select count(*)::int from public.room_type_public_offers('00000000-0000-4000-8000-000000000000')), 0, 'an unknown hostel lists nothing');
select throws_ok($$select * from app.quote_deposit('fixed', 0, 1, 1)$$, '42501', null, 'visitors cannot call the internal quote');

reset role;
select * from finish();
rollback;
