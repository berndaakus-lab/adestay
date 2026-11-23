-- Phase 3, task 15. public.booking_form_rules exposes two form flags and nothing else.
begin;
select plan(8);

create schema tests;
grant usage on schema tests to anon, authenticated;
create function tests.as_anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  execute 'set local role anon';
end $$;
grant execute on function tests.as_anon() to anon, authenticated;

insert into public.tenants (id, slug, name, reference_prefix, status, suspended_at, suspension_reason) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'hostel-a', 'Hostel A', 'HA', 'active', null, null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'hostel-b', 'Hostel B', 'HB', 'active', null, null),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'hostel-s', 'Hostel S', 'HS', 'suspended', now(), 'Unpaid'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'hostel-u', 'Hostel U', 'HU', 'active', null, null);
insert into public.tenant_profiles (tenant_id, display_name, is_published) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Hostel A', true),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Hostel B', true),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Hostel S', true),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Hostel U', false);
insert into public.tenant_settings (tenant_id, student_id_required, gender_policy_enforced) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true, true),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false, false),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', true, true),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', true, true);

select ok(has_function_privilege('anon', 'public.booking_form_rules(uuid)', 'execute'), 'visitors can read the form rules');
select is(pg_get_function_result('public.booking_form_rules(uuid)'::regprocedure),
  'TABLE(student_id_required boolean, gender_required boolean)', 'it returns only the two flags');

select tests.as_anon();
select is((select student_id_required from public.booking_form_rules('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')), true, 'student ID required is reported');
select is((select gender_required from public.booking_form_rules('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')), true, 'gender required is reported');
select is((select student_id_required or gender_required from public.booking_form_rules('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')), false, 'a hostel that asks for neither');
select is((select count(*)::int from public.booking_form_rules('cccccccc-cccc-4ccc-8ccc-cccccccccccc')), 0, 'a suspended hostel returns nothing');
select is((select count(*)::int from public.booking_form_rules('dddddddd-dddd-4ddd-8ddd-dddddddddddd')), 0, 'an unpublished hostel returns nothing');
select throws_ok('select * from public.tenant_settings', '42501', null, 'visitors still cannot read the settings table');
reset role;

select * from finish();
rollback;
