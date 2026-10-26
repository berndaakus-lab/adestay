-- Deny-by-default posture of everything created in Phase 1 task 3.
begin;
select plan(18);

-- Every table in public has RLS enabled AND forced.
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not (c.relrowsecurity and c.relforcerowsecurity)),
  0,
  'every public table has row level security enabled and forced'
);

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'),
  11,
  'task 3 creates exactly the 11 expected public tables'
);

select has_table('public', 'tenants', 'tenants exists');
select has_table('public', 'residents', 'residents exists');
select has_table('public', 'audit_logs', 'audit_logs exists');
select has_table('private', 'rate_limits', 'private.rate_limits exists');

-- No API privileges until task 4 adds policies (Supabase grants them by default).
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and (has_table_privilege('anon', c.oid, 'select,insert,update,delete')
       or has_table_privilege('authenticated', c.oid, 'select,insert,update,delete'))),
  0,
  'anon and authenticated have no privileges on any public table yet'
);

select ok(not has_schema_privilege('anon', 'private', 'usage'), 'anon cannot use schema private');
select ok(not has_schema_privilege('authenticated', 'private', 'usage'), 'authenticated cannot use schema private');

select ok(not has_function_privilege('anon', 'app.write_audit(uuid, text, text, text, jsonb, jsonb, text, text, text)', 'execute'),
  'anon cannot write audit entries');
select ok(not has_function_privilege('authenticated', 'app.write_audit(uuid, text, text, text, jsonb, jsonb, text, text, text)', 'execute'),
  'authenticated cannot write audit entries directly');
select ok(not has_function_privilege('authenticated', 'app.check_rate_limit(text, integer, interval)', 'execute'),
  'authenticated cannot touch rate-limit buckets');
select ok(not has_function_privilege('anon', 'app.handle_new_user()', 'execute'),
  'anon cannot call the new-user trigger function');

select ok(not has_table_privilege('service_role', 'public.audit_logs', 'update'), 'service role cannot update audit logs');
select ok(not has_table_privilege('service_role', 'public.audit_logs', 'delete'), 'service role cannot delete audit logs');

-- No app/private function is callable by everyone or by anonymous visitors (PUBLIC EXECUTE revoked).
select is(
  (select coalesce(array_agg(p.oid::regprocedure::text order by 1), '{}')
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('app', 'private') and has_function_privilege('anon', p.oid, 'execute')),
  '{}'::text[],
  'no app/private function is executable by anon'
);

-- Signed-in users may call only these helpers directly (whitelist grows deliberately in later tasks).
select is(
  (select coalesce(array_agg(p.proname::text order by p.proname), '{}')
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('app', 'private') and has_function_privilege('authenticated', p.oid, 'execute')),
  array['delegable_permissions', 'permission_catalog', 'valid_permissions']::text[],
  'authenticated can execute only the whitelisted app helpers'
);

-- Every SECURITY DEFINER function pins its search_path.
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('app', 'public', 'private') and p.prosecdef
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')),
  0,
  'every SECURITY DEFINER function sets search_path'
);

select * from finish();
rollback;
