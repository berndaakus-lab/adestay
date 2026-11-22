-- Phase 2, task 10. The verification job's narrow write path (ADR-0005, Phase 2 criteria 1 and 6).
begin;
select plan(19);

create schema tests;
grant usage on schema tests to anon, authenticated, service_role;

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

create function tests.status(p_host text) returns text
language sql security definer as $$ select status from public.tenant_domains where hostname = p_host $$;

grant execute on all functions in schema tests to anon, authenticated, service_role;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin@a.test'),
  ('00000000-0000-4000-8000-0000000000e1', 'platform@adestay.test');

insert into public.tenants (id, slug, name, reference_prefix, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'hostel-a', 'Hostel A', 'HA', 'active'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'hostel-x', 'Hostel X', 'HX', 'archived');
insert into public.tenant_memberships (tenant_id, user_id, role, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a1', 'hostel_admin', 'active');
insert into public.platform_admins (user_id) values ('00000000-0000-4000-8000-0000000000e1');

insert into public.tenant_domains (id, tenant_id, hostname, kind, status, is_primary, verified_at, verification) values
  ('80000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'pending.hostel-a.test', 'custom', 'pending', false, null, '{"old": true}'),
  ('80000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'failed.hostel-a.test', 'custom', 'failed', false, null, null),
  ('80000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'live.hostel-a.test', 'custom', 'verified', true, now(), null),
  ('80000000-0000-4000-8000-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'second.hostel-a.test', 'custom', 'verified', false, now(), null),
  ('80000000-0000-4000-8000-000000000005', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'hostel-a.adestay.test', 'platform_subdomain', 'pending', false, null, null),
  ('80000000-0000-4000-8000-000000000006', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'gone.hostel-a.test', 'custom', 'removed', false, null, null),
  ('80000000-0000-4000-8000-000000000007', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'old.hostel-x.test', 'custom', 'pending', false, null, null);

-- ---------------------------------------------------------------------------------------------
-- Only the service role may call it
-- ---------------------------------------------------------------------------------------------
select ok(has_function_privilege('service_role', 'public.record_domain_check(uuid, text, jsonb)', 'execute'), 'the service role can record a check');
select ok(not has_function_privilege('authenticated', 'public.record_domain_check(uuid, text, jsonb)', 'execute'), 'signed-in users have no grant');
select ok(not has_function_privilege('anon', 'public.record_domain_check(uuid, text, jsonb)', 'execute'), 'anon has no grant');

select tests.as_user('00000000-0000-4000-8000-0000000000a1', 'aal2');
select throws_ok($$select public.record_domain_check('80000000-0000-4000-8000-000000000001', 'verified')$$,
  '42501', null, 'hostel admin: cannot mark their own domain verified');
select tests.as_owner();
select tests.as_user('00000000-0000-4000-8000-0000000000e1', 'aal2');
select throws_ok($$select public.record_domain_check('80000000-0000-4000-8000-000000000001', 'verified')$$,
  '42501', null, 'platform admin session: must use the audited platform RPC instead');
select tests.as_owner();
select tests.as_anon();
select throws_ok($$select public.record_domain_check('80000000-0000-4000-8000-000000000001', 'verified')$$,
  '42501', null, 'anon: refused');
select tests.as_owner();

-- ---------------------------------------------------------------------------------------------
-- What the job may change
-- ---------------------------------------------------------------------------------------------
set local role service_role;
select ok(public.record_domain_check('80000000-0000-4000-8000-000000000001', 'pending', '{"records": 1}'), 'records a still-pending check');
select is((select verification ->> 'records' from public.tenant_domains where hostname = 'pending.hostel-a.test'), '1', 'keeps the latest instructions');
select ok(public.record_domain_check('80000000-0000-4000-8000-000000000001', 'verified'), 'a pending domain can become verified');
select ok(public.record_domain_check('80000000-0000-4000-8000-000000000002', 'verified'), 'a failed domain can recover');
select ok(not public.record_domain_check('80000000-0000-4000-8000-000000000003', 'failed'), 'a verified primary domain is left alone');
select ok(not public.record_domain_check('80000000-0000-4000-8000-000000000004', 'failed'), 'a verified domain is never downgraded');
select ok(not public.record_domain_check('80000000-0000-4000-8000-000000000005', 'verified'), 'platform subdomains are out of scope');
select ok(not public.record_domain_check('80000000-0000-4000-8000-000000000006', 'verified'), 'a removed domain stays removed');
select ok(not public.record_domain_check('80000000-0000-4000-8000-000000000007', 'verified'), 'an archived hostel''s domain is left alone');
select throws_ok($$select public.record_domain_check('80000000-0000-4000-8000-000000000002', 'removed')$$,
  '22023', null, 'the job cannot remove a domain');
reset role;

select is(tests.status('live.hostel-a.test') || ' ' || tests.status('second.hostel-a.test') || ' ' || tests.status('gone.hostel-a.test'),
  'verified verified removed', 'protected domains are unchanged');
select is((select slug from app.resolve_tenant_by_host('pending.hostel-a.test')), 'hostel-a', 'a newly verified domain resolves');
select ok(exists (select 1 from public.audit_logs where action = 'tenant_domain.verified' and actor_type = 'cron'
                    and tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'verification is in the hostel''s audit log');

select * from finish();
rollback;
