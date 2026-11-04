-- Slug lookup exposes only public facts and never archived tenants.
begin;
select plan(5);

insert into public.tenants (id, slug, name, reference_prefix, status, suspended_at, suspension_reason) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'hostel-a', 'Hostel A', 'HA', 'active', null, null),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'hostel-s', 'Hostel S', 'HS', 'suspended', now(), 'Unpaid subscription'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'hostel-old', 'Hostel Old', 'HO', 'archived', null, null);

set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);

select is((select tenant_id from public.resolve_tenant_by_slug('  HOSTEL-A ')), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
  'anon resolves a slug (case and spaces normalised)');
select is((select status from public.resolve_tenant_by_slug('hostel-s')), 'suspended', 'suspended hostels resolve with their status');
select is((select count(*)::int from public.resolve_tenant_by_slug('hostel-old')), 0, 'archived hostels do not resolve');
select is((select count(*)::int from public.resolve_tenant_by_slug('nope')), 0, 'unknown slugs resolve to nothing');
select throws_ok('select name from public.tenants', '42501', null, 'anon still cannot read the tenants table');

reset role;
select * from finish();
rollback;
