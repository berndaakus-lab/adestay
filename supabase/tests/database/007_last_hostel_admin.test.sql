-- A live hostel always keeps at least one active hostel admin.
begin;
select plan(8);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin1@a.test'),
  ('00000000-0000-4000-8000-0000000000a2', 'admin2@a.test'),
  ('00000000-0000-4000-8000-0000000000a3', 'staff@a.test');
insert into public.tenants (id, slug, name, reference_prefix, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'hostel-a', 'Hostel A', 'HA', 'active');
insert into public.tenant_memberships (id, tenant_id, user_id, role, permission_set_id, status) values
  ('a1000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a1', 'hostel_admin', null, 'active'),
  ('a2000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a2', 'hostel_admin', null, 'active'),
  ('a3000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a3', 'staff',
     (select id from public.permission_sets where key = 'front_desk' and is_system), 'active');

select lives_ok($$update public.tenant_memberships set status = 'revoked', revoked_at = now() where id = 'a2000000-0000-4000-8000-000000000002'$$,
  'one of two admins can be revoked');
select throws_ok($$update public.tenant_memberships set status = 'revoked', revoked_at = now() where id = 'a1000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'the last admin cannot be revoked');
select throws_ok($$update public.tenant_memberships set role = 'staff', permission_set_id = (select id from public.permission_sets where key = 'manager' and is_system) where id = 'a1000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'the last admin cannot be demoted to staff');
select throws_ok($$delete from public.tenant_memberships where id = 'a1000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'the last admin cannot be deleted');
select lives_ok($$update public.tenant_memberships set status = 'revoked', revoked_at = now() where id = 'a3000000-0000-4000-8000-000000000003'$$,
  'staff can still be revoked freely');
select lives_ok($$update public.tenant_memberships set updated_at = now() where id = 'a1000000-0000-4000-8000-000000000001'$$,
  'unrelated updates to the last admin are allowed');

-- Promote another member first, then the original admin can step down.
update public.tenant_memberships set status = 'active', revoked_at = null where id = 'a2000000-0000-4000-8000-000000000002';
select lives_ok($$update public.tenant_memberships set status = 'revoked', revoked_at = now() where id = 'a1000000-0000-4000-8000-000000000001'$$,
  'an admin can step down once another admin exists');

-- Archived tenants are exempt (approved, scripted deletion).
update public.tenants set status = 'archived' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select lives_ok($$delete from public.tenant_memberships where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  'memberships of an archived tenant can be removed');

select * from finish();
rollback;
