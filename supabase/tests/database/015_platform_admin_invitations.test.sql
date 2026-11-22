-- Phase 2, task 8. The platform's narrow view of hostel-admin invitations (RBAC_MATRIX §4).
begin;
select plan(8);

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

grant execute on all functions in schema tests to anon, authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin@a.test'),
  ('00000000-0000-4000-8000-0000000000a2', 'frontdesk@a.test'),
  ('00000000-0000-4000-8000-0000000000e1', 'platform@adestay.test');

insert into public.tenants (id, slug, name, reference_prefix, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'hostel-a', 'Hostel A', 'HA', 'active');

insert into public.tenant_memberships (tenant_id, user_id, role, permission_set_id, status, invited_email, revoked_at) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a1', 'hostel_admin', null, 'active', 'admin@a.test', null),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, 'hostel_admin', null, 'invited', 'second@a.test', null),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, 'hostel_admin', null, 'revoked', 'former@a.test', now()),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a2', 'staff',
     (select id from public.permission_sets where key = 'front_desk' and is_system), 'active', 'frontdesk@a.test', null);

insert into public.platform_admins (user_id) values ('00000000-0000-4000-8000-0000000000e1');

select tests.as_user('00000000-0000-4000-8000-0000000000e1', 'aal2');
select is((select array_agg(email || ' ' || status order by email)
           from public.platform_hostel_admin_invitations('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')),
  array['admin@a.test active', 'second@a.test invited'], 'platform admin: sees open and accepted hostel-admin invitations');
select is((select count(*)::int from public.platform_hostel_admin_invitations('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
           where email = 'frontdesk@a.test'), 0, 'platform admin: ordinary staff are not returned');
select is((select count(*)::int from public.platform_hostel_admin_invitations('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
           where email = 'former@a.test'), 0, 'platform admin: revoked admins are not returned');
select is((select count(*)::int from public.tenant_memberships), 0, 'platform admin: still no general read of memberships');
select tests.as_owner();

select tests.as_user('00000000-0000-4000-8000-0000000000e1', 'aal1');
select throws_ok($$select * from public.platform_hostel_admin_invitations('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$,
  '42501', null, 'platform admin without MFA: refused');
select tests.as_owner();

select tests.as_user('00000000-0000-4000-8000-0000000000a1', 'aal2');
select throws_ok($$select * from public.platform_hostel_admin_invitations('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$,
  '42501', null, 'hostel admin: refused');
select tests.as_owner();

select tests.as_user('00000000-0000-4000-8000-0000000000a2');
select throws_ok($$select * from public.platform_hostel_admin_invitations('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$,
  '42501', null, 'staff: refused');
select tests.as_owner();

select tests.as_anon();
select throws_ok($$select * from public.platform_hostel_admin_invitations('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$,
  '42501', null, 'anon: refused');
select tests.as_owner();

select * from finish();
rollback;
