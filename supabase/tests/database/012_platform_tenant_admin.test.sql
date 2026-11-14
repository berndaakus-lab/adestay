-- Phase 2, task 4. Platform administration: create tenant, first admin, status transitions, domains
-- (docs/RBAC_MATRIX.md §4; Phase 2 acceptance criteria 1, 5 and 6).
begin;
select plan(50);

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

-- Reads as the owner (bypasses RLS) so assertions can inspect state from any role.
create function tests.tenant(p_slug text) returns public.tenants
language sql security definer as $$ select * from public.tenants where slug = p_slug $$;
create function tests.domain(p_host text) returns public.tenant_domains
language sql security definer as $$ select * from public.tenant_domains where hostname = p_host $$;

grant execute on all functions in schema tests to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Fixtures: an existing active hostel A with its admin; a platform admin; the future owner of the
-- new hostel (account already exists, confirmed email).
-- ---------------------------------------------------------------------------------------------
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin@a.test', now()),
  ('00000000-0000-4000-8000-0000000000e1', 'platform@adestay.test', now()),
  ('00000000-0000-4000-8000-0000000000f1', 'owner@new.test', now());

insert into public.tenants (id, slug, name, reference_prefix, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'hostel-a', 'Hostel A', 'HA', 'active');
insert into public.tenant_domains (tenant_id, hostname, kind, status, is_primary, verified_at) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'hostel-a.adestay.test', 'platform_subdomain', 'verified', true, now());
insert into public.tenant_memberships (tenant_id, user_id, role, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a1', 'hostel_admin', 'active');
insert into public.platform_admins (user_id) values ('00000000-0000-4000-8000-0000000000e1');

-- ---------------------------------------------------------------------------------------------
-- Who may create tenants
-- ---------------------------------------------------------------------------------------------
select tests.as_user('00000000-0000-4000-8000-0000000000e1', 'aal1');
select throws_ok($$select public.create_tenant('x-hostel', 'X Hostel', 'XH')$$, '42501', null,
  'platform admin without MFA: cannot create a hostel');
select tests.as_owner();

select tests.as_user('00000000-0000-4000-8000-0000000000a1', 'aal2');
select throws_ok($$select public.create_tenant('x-hostel', 'X Hostel', 'XH')$$, '42501', null,
  'hostel admin: cannot create a hostel');
select throws_ok($$select public.platform_invite_hostel_admin('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'x@example.test')$$,
  '42501', null, 'hostel admin: cannot use the platform invitation');
select throws_ok($$select public.set_tenant_status('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'suspended', 'Testing')$$,
  '42501', null, 'hostel admin: cannot suspend their own hostel');
select tests.as_owner();

select tests.as_anon();
select throws_ok($$select public.create_tenant('x-hostel', 'X Hostel', 'XH')$$, '42501', null, 'anon: cannot create a hostel');
select tests.as_owner();

-- ---------------------------------------------------------------------------------------------
-- Onboarding a hostel end to end (criterion 1, database part)
-- ---------------------------------------------------------------------------------------------
select tests.as_user('00000000-0000-4000-8000-0000000000e1', 'aal2');
select isnt(public.create_tenant('  New-Hostel ', 'New Hostel', ' nh ', 'AdeStay.test.', ' Owner@New.test '), null,
  'platform admin: creates a hostel in one call');
select is((tests.tenant('new-hostel')).status || ' ' || (tests.tenant('new-hostel')).reference_prefix, 'onboarding NH',
  'the hostel starts in onboarding with a normalised slug and prefix');
select is((select display_name || ' ' || is_published::text from public.tenant_profiles
           where tenant_id = (tests.tenant('new-hostel')).id), 'New Hostel false',
  'an unpublished profile is created');
select is((tests.domain('new-hostel.adestay.test')).status || ' ' || (tests.domain('new-hostel.adestay.test')).is_primary::text,
  'verified true', 'the platform subdomain is created, verified and primary');
select is((select count(*)::int from public.tenant_settings) + (select count(*)::int from public.tenant_memberships),
  0, 'platform admin: still cannot read the hostel''s settings or staff without break-glass (RBAC §4)');
-- Private rows are checked as the owner.
select tests.as_owner();
select is((select count(*)::int from public.tenant_settings where tenant_id = (tests.tenant('new-hostel')).id), 1,
  'default settings are created');
select is((select role || ' ' || status || ' ' || invited_email::text from public.tenant_memberships
           where tenant_id = (tests.tenant('new-hostel')).id), 'hostel_admin invited owner@new.test',
  'the first hostel admin is invited');
select ok(exists (select 1 from public.audit_logs where entity_type = 'tenants' and action = 'tenants.created'
                    and tenant_id = (tests.tenant('new-hostel')).id), 'creation is audited');
select tests.as_user('00000000-0000-4000-8000-0000000000e1', 'aal2');
select throws_ok($$select public.create_tenant('new-hostel', 'Another', 'AN')$$, '23505', null, 'slugs are unique');
select throws_ok($$select public.create_tenant('app', 'App', 'AP')$$, '23514', null, 'reserved slugs are refused');
select lives_ok($$select public.create_tenant('bare-hostel', 'Bare Hostel', 'BH')$$,
  'a hostel can be created before the root domain exists (D-1) and without an admin yet');
select is((select count(*)::int from public.tenant_domains where tenant_id = (tests.tenant('bare-hostel')).id), 0,
  'no subdomain row without a root domain');
select throws_ok($$select public.set_tenant_status((tests.tenant('bare-hostel')).id, 'active', 'Ready to go')$$,
  '22023', null, 'a hostel without an admin invitation cannot be activated');
select throws_ok($$select public.platform_invite_hostel_admin('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'second@a.test')$$,
  '23505', null, 'platform admin: no admin invitation once the hostel has an active admin');
select throws_ok($$select public.set_tenant_status((tests.tenant('new-hostel')).id, 'active', '')$$,
  '22023', null, 'status changes need a reason');
select lives_ok($$select public.set_tenant_status((tests.tenant('new-hostel')).id, 'active', 'Onboarding call done')$$,
  'platform admin: activates the hostel');
select tests.as_owner();

select tests.as_user('00000000-0000-4000-8000-0000000000f1');
select is(public.accept_my_invitations(), 1, 'the invited owner accepts on first sign-in');
select ok(app.has_permission((tests.tenant('new-hostel')).id, 'settings.manage'), 'the new hostel admin can manage the hostel');
select tests.as_owner();

-- ---------------------------------------------------------------------------------------------
-- Suspend and restore (criterion 5)
-- ---------------------------------------------------------------------------------------------
select tests.as_user('00000000-0000-4000-8000-0000000000e1', 'aal2');
select lives_ok($$select public.set_tenant_status((tests.tenant('new-hostel')).id, 'suspended', 'Subscription unpaid')$$,
  'platform admin: suspends a hostel');
select ok((tests.tenant('new-hostel')).suspended_at is not null
          and (tests.tenant('new-hostel')).suspension_reason = 'Subscription unpaid', 'suspension time and reason are stored');
select throws_ok($$select public.set_tenant_status((tests.tenant('new-hostel')).id, 'suspended', 'Again')$$,
  '22023', null, 'a suspended hostel cannot be suspended again');
select throws_ok($$select public.set_tenant_status((tests.tenant('bare-hostel')).id, 'suspended', 'Not live yet')$$,
  '22023', null, 'an onboarding hostel cannot be suspended');
select throws_ok($$select public.set_tenant_status((tests.tenant('new-hostel')).id, 'archived', 'Closing down')$$,
  '22023', null, 'archiving is not available through this RPC');
select tests.as_owner();

select tests.as_user('00000000-0000-4000-8000-0000000000f1');
select ok(not app.is_tenant_member((tests.tenant('new-hostel')).id), 'suspended: the hostel admin is denied');
select tests.as_owner();

select tests.as_anon();
select is((select status from app.resolve_tenant_by_host('new-hostel.adestay.test')), 'suspended',
  'suspended: the site resolves as suspended, so it shows the unavailable page');
select tests.as_owner();

select tests.as_user('00000000-0000-4000-8000-0000000000e1', 'aal2');
select lives_ok($$select public.set_tenant_status((tests.tenant('new-hostel')).id, 'active', 'Payment received')$$,
  'platform admin: restores the hostel');
select ok((tests.tenant('new-hostel')).suspended_at is null and (tests.tenant('new-hostel')).suspension_reason is null,
  'restoring clears the suspension');
select tests.as_owner();

select tests.as_user('00000000-0000-4000-8000-0000000000f1');
select ok(app.is_tenant_member((tests.tenant('new-hostel')).id), 'restored: the hostel admin has access again');
select ok(exists (select 1 from public.audit_logs where action = 'tenant.suspended' and reason = 'Subscription unpaid'),
  'the hostel admin sees the suspension and its reason in their audit log');
select tests.as_owner();

-- ---------------------------------------------------------------------------------------------
-- Direct writes are gone; everything goes through the RPCs
-- ---------------------------------------------------------------------------------------------
select tests.as_user('00000000-0000-4000-8000-0000000000e1', 'aal2');
select throws_ok($$update public.tenants set status = 'suspended', suspended_at = now(), suspension_reason = 'Direct'
  where slug = 'hostel-a'$$, '42501', null, 'platform admin: no direct status updates');
select throws_ok($$insert into public.tenants (slug, name, reference_prefix) values ('direct', 'Direct', 'DI')$$,
  '42501', null, 'platform admin: no direct tenant inserts');
select throws_ok($$insert into public.tenant_domains (tenant_id, hostname, kind, status, verified_at)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'evil.example.com', 'custom', 'verified', now())$$,
  '42501', null, 'platform admin: no direct domain inserts (a domain cannot be marked verified by hand)');

-- ---------------------------------------------------------------------------------------------
-- Domains
-- ---------------------------------------------------------------------------------------------
select lives_ok($$select public.add_custom_domain((tests.tenant('new-hostel')).id, ' Book.NewHostel.com.GH. ', 'adestay.test')$$,
  'platform admin: adds a custom domain');
select is((tests.domain('book.newhostel.com.gh')).status || ' ' || (tests.domain('book.newhostel.com.gh')).is_primary::text,
  'pending false', 'a custom domain starts pending and not primary');
select is((select count(*)::int from app.resolve_tenant_by_host('book.newhostel.com.gh')), 0, 'a pending domain does not resolve');
select throws_ok($$select public.add_custom_domain((tests.tenant('new-hostel')).id, 'hostel-x.adestay.test', 'adestay.test')$$,
  '22023', null, 'a custom domain cannot sit under the platform domain');
select throws_ok($$select public.add_custom_domain((tests.tenant('new-hostel')).id, 'hostel-a.adestay.test')$$,
  '23505', null, 'another hostel''s hostname cannot be taken');
select throws_ok($$select public.set_primary_domain((tests.domain('book.newhostel.com.gh')).id)$$,
  '22023', null, 'a pending domain cannot be primary');
select lives_ok($$select public.set_domain_status((tests.domain('book.newhostel.com.gh')).id, 'verified',
  '{"cname": "cname.vercel-dns.com"}')$$, 'platform admin: marks the domain verified');
select is((select slug from app.resolve_tenant_by_host('book.newhostel.com.gh')), 'new-hostel', 'a verified custom domain resolves');
select lives_ok($$select public.set_primary_domain((tests.domain('book.newhostel.com.gh')).id)$$, 'it can then be made primary');
select throws_ok($$select public.set_domain_status((tests.domain('book.newhostel.com.gh')).id, 'failed')$$,
  '22023', null, 'the primary domain cannot be marked failed');
select lives_ok($$select public.remove_domain((tests.domain('new-hostel.adestay.test')).id, 'Hostel uses its own domain only')$$,
  'the former primary subdomain can be removed with a reason');
select tests.as_owner();

select tests.as_user('00000000-0000-4000-8000-0000000000f1');
select is((select count(*)::int from public.tenant_domains where tenant_id = (tests.tenant('new-hostel')).id), 2,
  'hostel admin: can see their hostel''s domains (including removed)');
select throws_ok($$select public.add_custom_domain((tests.tenant('new-hostel')).id, 'rooms.newhostel.com.gh')$$,
  '42501', null, 'hostel admin: cannot add domains');
select tests.as_owner();

select * from finish();
rollback;
