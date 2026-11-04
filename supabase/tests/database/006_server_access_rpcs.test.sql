-- Server entry points: host resolution, the caller's memberships, platform-admin check.
begin;
select plan(12);

create schema tests;
grant usage on schema tests to anon, authenticated;
create function tests.as_user(p_user uuid, p_aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true);
  execute 'set local role authenticated';
end $$;
create function tests.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  execute 'set local role anon';
end $$;
create function tests.as_owner() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;
grant execute on all functions in schema tests to anon, authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin@a.test'),
  ('00000000-0000-4000-8000-0000000000a2', 'frontdesk@a.test'),
  ('00000000-0000-4000-8000-0000000000e1', 'platform@adestay.test');
insert into public.tenants (id, slug, name, reference_prefix, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'hostel-a', 'Hostel A', 'HA', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'hostel-b', 'Hostel B', 'HB', 'active');
insert into public.tenant_domains (tenant_id, hostname, kind, status, is_primary, verified_at) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'book.hostel-a.com', 'custom', 'verified', true, now());
insert into public.tenant_memberships (tenant_id, user_id, role, permission_set_id, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a1', 'hostel_admin', null, 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-4000-8000-0000000000a1', 'hostel_admin', null, 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a2', 'staff',
     (select id from public.permission_sets where key = 'front_desk' and is_system), 'active');
insert into public.platform_admins (user_id) values ('00000000-0000-4000-8000-0000000000e1');

-- Host resolution through the public entry point
select tests.as_anon();
select is((select slug from public.resolve_tenant_by_host('Book.Hostel-A.com.')), 'hostel-a', 'anon resolves a verified custom domain');
select is((select count(*)::int from public.resolve_tenant_by_host('evil.example.com')), 0, 'unknown host resolves to nothing');
select throws_ok('select * from public.my_memberships()', '42501', null, 'anon cannot call my_memberships');
select throws_ok('select public.am_i_platform_admin()', '42501', null, 'anon cannot call am_i_platform_admin');
select tests.as_owner();

-- Memberships with effective permissions
select tests.as_user('00000000-0000-4000-8000-0000000000a1');
select is((select array_agg(slug order by slug) from public.my_memberships()), array['hostel-a', 'hostel-b'],
  'an admin of two hostels sees both memberships (tenant switcher)');
select ok((select 'payments.configure' = any (permissions) from public.my_memberships() where slug = 'hostel-a'),
  'hostel admins get the full permission catalog');
select tests.as_owner();

select tests.as_user('00000000-0000-4000-8000-0000000000a2');
select is((select array_agg(slug) from public.my_memberships()), array['hostel-a'], 'staff sees only own membership');
select ok((select 'checkin.manage' = any (permissions) and not ('settings.manage' = any (permissions))
           from public.my_memberships()), 'staff permissions come from their permission set');
select tests.as_owner();

update public.tenants set status = 'suspended', suspended_at = now(), suspension_reason = 'Test suspension' where slug = 'hostel-b';
select tests.as_user('00000000-0000-4000-8000-0000000000a1');
select is((select array_agg(slug) from public.my_memberships()), array['hostel-a'], 'suspended hostels drop out of memberships');
select tests.as_owner();

-- Platform admin requires MFA
select tests.as_user('00000000-0000-4000-8000-0000000000e1', 'aal1');
select is(public.am_i_platform_admin(), false, 'platform admin without MFA is not treated as platform admin');
select tests.as_owner();
select tests.as_user('00000000-0000-4000-8000-0000000000e1', 'aal2');
select is(public.am_i_platform_admin(), true, 'platform admin with MFA is recognised');
select tests.as_owner();
select tests.as_user('00000000-0000-4000-8000-0000000000a1', 'aal2');
select is(public.am_i_platform_admin(), false, 'a hostel admin is not a platform admin');
select tests.as_owner();

select * from finish();
rollback;
