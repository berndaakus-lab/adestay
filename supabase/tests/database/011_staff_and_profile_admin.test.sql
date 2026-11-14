-- Phase 2, task 3. Staff invitations, membership changes, custom permission sets and profile/settings
-- edits (docs/RBAC_MATRIX.md §4-5; Phase 2 acceptance criteria 3 and 6).
begin;
select plan(52);

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

-- Membership id of a user in a tenant, read as the owner (bypasses RLS) for use in test SQL.
create function tests.mid(p_user uuid, p_tenant uuid default 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') returns uuid
language sql security definer as $$
  select id from public.tenant_memberships where user_id = p_user and tenant_id = p_tenant
$$;

grant execute on all functions in schema tests to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------------------------
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin@a.test', now()),
  ('00000000-0000-4000-8000-0000000000a2', 'frontdesk@a.test', now()),
  ('00000000-0000-4000-8000-0000000000a3', 'accounts@a.test', now()),
  ('00000000-0000-4000-8000-0000000000a5', 'admin2@a.test', now()),
  ('00000000-0000-4000-8000-0000000000b1', 'admin@b.test', now()),
  ('00000000-0000-4000-8000-0000000000c1', 'admin@s.test', now()),
  ('00000000-0000-4000-8000-0000000000e1', 'platform@adestay.test', now()),
  ('00000000-0000-4000-8000-0000000000f1', 'new@example.test', now()),
  ('00000000-0000-4000-8000-0000000000f2', 'unconfirmed@example.test', null);

insert into public.tenants (id, slug, name, reference_prefix, status, suspended_at, suspension_reason) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'hostel-a', 'Hostel A', 'HA', 'active', null, null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'hostel-b', 'Hostel B', 'HB', 'active', null, null),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'hostel-s', 'Hostel S', 'HS', 'suspended', now(), 'Unpaid subscription');

insert into public.tenant_profiles (tenant_id, display_name, primary_color) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Hostel A', '#234536'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Hostel B', null);
insert into public.tenant_settings (tenant_id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

insert into public.permission_sets (id, tenant_id, key, name, permissions) values
  ('99999999-0000-4000-8000-0000000000b9', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b_custom', 'B custom', array['inventory.read']);

insert into public.tenant_memberships (tenant_id, user_id, role, permission_set_id, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a1', 'hostel_admin', null, 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a2', 'staff',
     (select id from public.permission_sets where key = 'front_desk' and is_system), 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a3', 'staff',
     (select id from public.permission_sets where key = 'accounts' and is_system), 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a5', 'hostel_admin', null, 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-4000-8000-0000000000b1', 'hostel_admin', null, 'active'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '00000000-0000-4000-8000-0000000000c1', 'hostel_admin', null, 'active');

insert into public.platform_admins (user_id) values ('00000000-0000-4000-8000-0000000000e1');
insert into public.platform_access_grants (platform_admin_user_id, tenant_id, reason, granted_at, expires_at) values
  ('00000000-0000-4000-8000-0000000000e1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Support ticket about staff access',
   now() - interval '5 minutes', now() + interval '1 hour');

-- ---------------------------------------------------------------------------------------------
-- Brand colour contrast (criterion 3)
-- ---------------------------------------------------------------------------------------------
select ok(app.brand_color_is_readable('#234536'), 'forest (#234536) is a readable brand colour');
select ok(not app.brand_color_is_readable('#b69a61'), 'brass (#b69a61) is rejected');
select ok(not app.brand_color_is_readable('#767676'), '#767676 passes on white (4.54) but fails on ivory, so it is rejected');
select ok(not app.brand_color_is_readable('#FFFFFF'), 'malformed or upper-case hex is rejected');
select ok(app.brand_color_is_readable(null), 'no brand colour (platform default) is allowed');

select tests.as_user('00000000-0000-4000-8000-0000000000a1', 'aal2');
select throws_ok($$update public.tenant_profiles set primary_color = '#b69a61' where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  '23514', null, 'admin A: a low-contrast brand colour is refused');
select throws_ok($$update public.tenant_profiles set accent_color = '#e8f0e9' where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  '23514', null, 'admin A: a low-contrast accent colour is refused');
select lives_ok($$update public.tenant_profiles set primary_color = '#1f3d2f' where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  'admin A: a readable brand colour is saved');
select throws_ok($$update public.tenant_profiles
  set logo_path = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/branding/logo-0001.png' where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  '23514', null, 'admin A: the logo must live in hostel A''s branding folder');
select throws_ok($$update public.tenant_profiles set logo_path = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/branding/logo.svg'
  where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, '23514', null, 'admin A: SVG logos are refused');
select throws_ok($$update public.tenant_profiles set tenant_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, '42501', null, 'admin A: a profile cannot be moved to another hostel');
select throws_ok($$update public.tenant_settings set tenant_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, '42501', null, 'admin A: settings cannot be moved to another hostel');
select lives_ok($$update public.tenant_settings set hold_duration_hours = 72 where tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  'admin A: can change operational settings');
select tests.as_owner();

select tests.as_user('00000000-0000-4000-8000-0000000000a2');
with u as (update public.tenant_profiles set tagline = 'Hijacked' returning 1)
select is((select count(*)::int from u), 0, 'front desk (no settings.manage): cannot edit the profile');
select tests.as_owner();

-- ---------------------------------------------------------------------------------------------
-- Custom permission sets
-- ---------------------------------------------------------------------------------------------
select tests.as_user('00000000-0000-4000-8000-0000000000a1', 'aal2');
select lives_ok($$insert into public.permission_sets (tenant_id, key, name, permissions)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'porter', 'Porter', array['inventory.read', 'checkin.manage'])$$,
  'admin A: can create a custom permission set');
select throws_ok($$insert into public.permission_sets (tenant_id, key, name, permissions)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'deputy', 'Deputy', array['staff.manage'])$$,
  '23514', null, 'admin A: staff.manage cannot be put in a staff set');
select throws_ok($$insert into public.permission_sets (tenant_id, key, name, permissions, is_system)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'fake_system', 'Fake', array['inventory.read'], true)$$,
  '42501', null, 'admin A: cannot create a system set');
with u as (update public.permission_sets set permissions = array['inventory.read'] where is_system returning 1)
select is((select count(*)::int from u), 0, 'admin A: system sets are read-only');
select throws_ok($$update public.permission_sets set tenant_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' where key = 'porter'$$,
  '42501', null, 'admin A: a set cannot be moved to another hostel');
select tests.as_owner();

select tests.as_user('00000000-0000-4000-8000-0000000000a2');
select throws_ok($$insert into public.permission_sets (tenant_id, key, name, permissions)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'my_set', 'Mine', array['inventory.manage'])$$,
  '42501', null, 'front desk: cannot create permission sets');
select tests.as_owner();

-- ---------------------------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------------------------
select tests.as_user('00000000-0000-4000-8000-0000000000a1', 'aal2');
select isnt(public.invite_staff_member('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '  NEW@Example.test ', 'staff',
  (select id from public.permission_sets where key = 'front_desk' and is_system)), null, 'admin A: can invite a new staff member');
select is((select status || ' ' || invited_email::text from public.tenant_memberships where invited_email = 'new@example.test'),
  'invited new@example.test', 'the invitation is stored with a normalised email');
select throws_ok($$select public.invite_staff_member('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'new@example.test', 'staff',
  (select id from public.permission_sets where key = 'accounts' and is_system))$$, '23505', null, 'the same address cannot be invited twice');
select throws_ok($$select public.invite_staff_member('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'FrontDesk@a.test', 'staff',
  (select id from public.permission_sets where key = 'accounts' and is_system))$$, '23505', null, 'an existing member cannot be invited again');
select throws_ok($$select public.invite_staff_member('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'not-an-email', 'staff',
  (select id from public.permission_sets where key = 'accounts' and is_system))$$, '22023', null, 'an invalid email is refused');
select throws_ok($$select public.invite_staff_member('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'x@example.test', 'staff', null)$$,
  '22023', null, 'staff invitations need a permission set');
select throws_ok($$select public.invite_staff_member('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'x@example.test', 'staff',
  '99999999-0000-4000-8000-0000000000b9')$$, '22023', null, 'another hostel''s permission set cannot be used');
select throws_ok($$select public.invite_staff_member('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'x@example.test', 'hostel_admin')$$,
  '42501', null, 'admin A: cannot invite into hostel B');
select lives_ok($$select public.invite_staff_member('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'unconfirmed@example.test', 'staff',
  (select id from public.permission_sets where key = 'porter'))$$, 'admin A: can invite with a custom set');
select tests.as_owner();

select tests.as_user('00000000-0000-4000-8000-0000000000a2');
select throws_ok($$select public.invite_staff_member('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'y@example.test', 'staff',
  (select id from public.permission_sets where key = 'manager' and is_system))$$, '42501', null, 'front desk: cannot invite');
select throws_ok($$select public.change_member_role(tests.mid('00000000-0000-4000-8000-0000000000a3'), 'staff',
  (select id from public.permission_sets where key = 'manager' and is_system))$$, '42501', null, 'front desk: cannot change roles');
select tests.as_owner();

select tests.as_user('00000000-0000-4000-8000-0000000000c1', 'aal2');
select throws_ok($$select public.invite_staff_member('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'y@example.test', 'hostel_admin')$$,
  '42501', null, 'admin of a suspended hostel: cannot invite');
select tests.as_owner();

select tests.as_user('00000000-0000-4000-8000-0000000000e1', 'aal2');
select throws_ok($$select public.invite_staff_member('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'y@example.test', 'hostel_admin')$$,
  '42501', null, 'platform admin with break-glass: cannot invite (read-only)');
select tests.as_owner();

select tests.as_anon();
select throws_ok($$select public.invite_staff_member('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'y@example.test', 'hostel_admin')$$,
  '42501', null, 'anon: cannot call the invitation RPC');
select tests.as_owner();

-- ---------------------------------------------------------------------------------------------
-- Accepting invitations
-- ---------------------------------------------------------------------------------------------
select tests.as_user('00000000-0000-4000-8000-0000000000f2');
select is(public.accept_my_invitations(), 0, 'an unconfirmed email cannot accept an invitation');
select tests.as_owner();

select tests.as_user('00000000-0000-4000-8000-0000000000f1');
select is(public.accept_my_invitations(), 1, 'a confirmed email accepts its open invitation');
select ok(app.has_permission('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'inventory.read'), 'the new member now holds the set''s permissions');
select is(public.accept_my_invitations(), 0, 'accepting again does nothing');
select tests.as_owner();

-- ---------------------------------------------------------------------------------------------
-- Role changes and revocation
-- ---------------------------------------------------------------------------------------------
select tests.as_user('00000000-0000-4000-8000-0000000000a1', 'aal2');
select lives_ok($$select public.change_member_role(tests.mid('00000000-0000-4000-8000-0000000000a2'), 'staff',
  (select id from public.permission_sets where key = 'manager' and is_system))$$, 'admin A: can move front desk to the manager set');
select throws_ok($$select public.change_member_role(tests.mid('00000000-0000-4000-8000-0000000000a1'), 'staff',
  (select id from public.permission_sets where key = 'manager' and is_system))$$, '42501', null, 'admin A: cannot change their own role');
select throws_ok($$select public.change_member_role(tests.mid('00000000-0000-4000-8000-0000000000a2'), 'hostel_admin',
  (select id from public.permission_sets where key = 'manager' and is_system))$$, '22023', null, 'hostel admins have no permission set');
select throws_ok($$select public.change_member_role(tests.mid('00000000-0000-4000-8000-0000000000b1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  'staff', '99999999-0000-4000-8000-0000000000b9')$$, '42501', null, 'admin A: cannot change a hostel B member');
select throws_ok($$select public.revoke_membership(tests.mid('00000000-0000-4000-8000-0000000000a1'), 'Leaving the business')$$,
  '42501', null, 'admin A: cannot revoke their own membership');
select throws_ok($$select public.revoke_membership(tests.mid('00000000-0000-4000-8000-0000000000a3'), '')$$,
  '22023', null, 'revocation needs a reason');
select lives_ok($$select public.revoke_membership(tests.mid('00000000-0000-4000-8000-0000000000a3'), 'Contract ended')$$,
  'admin A: can revoke a staff member');
select ok(exists (select 1 from public.audit_logs where action = 'membership.revoked' and reason = 'Contract ended'
                    and tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'the revocation and its reason are audited');
select throws_ok($$select public.revoke_membership(tests.mid('00000000-0000-4000-8000-0000000000a3'), 'Again')$$,
  '22023', null, 'an already revoked membership cannot be revoked again');
select is(public.invite_staff_member('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'accounts@a.test', 'staff',
  (select id from public.permission_sets where key = 'accounts' and is_system)),
  tests.mid('00000000-0000-4000-8000-0000000000a3'), 're-inviting a former member reopens their membership');
select lives_ok($$select public.revoke_membership(
  (select id from public.tenant_memberships where invited_email = 'unconfirmed@example.test'), 'Sent to the wrong address')$$,
  'admin A: can cancel an open invitation');
select ok(exists (select 1 from public.audit_logs where action = 'membership.invitation_cancelled'),
  'the cancelled invitation is audited');
select lives_ok($$select public.revoke_membership(tests.mid('00000000-0000-4000-8000-0000000000a5'), 'Second admin no longer needed')$$,
  'admin A: can remove another hostel admin while remaining one');
select tests.as_owner();

select tests.as_user('00000000-0000-4000-8000-0000000000a3');
select ok(not app.is_tenant_member('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'a revoked (re-invited, not yet accepted) member has no access');
select tests.as_owner();

select * from finish();
rollback;
