-- Deny-by-default posture: exactly the API access that the RBAC matrix allows, nothing more.
begin;
select plan(23);

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
  18,
  'exactly the 18 expected public tables (Phase 1: 11, Phase 2 inventory: 7)'
);

select has_table('public', 'tenants', 'tenants exists');
select has_table('public', 'residents', 'residents exists');
select has_table('public', 'audit_logs', 'audit_logs exists');
select has_table('private', 'rate_limits', 'private.rate_limits exists');

-- Anonymous visitors can read only public-content tables (rows further limited by RLS) and write nothing.
select is(
  (select coalesce(array_agg(c.relname::text order by c.relname), '{}') from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and (has_table_privilege('anon', c.oid, 'select,insert,update,delete,truncate')
       or has_any_column_privilege('anon', c.oid, 'select,insert,update'))),
  array['booking_periods', 'room_type_photos', 'room_type_prices', 'room_types', 'tenant_profiles']::text[],
  'anon can access only the public-content tables'
);
select is(
  (select coalesce(array_agg(c.relname::text order by c.relname), '{}') from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and (has_table_privilege('anon', c.oid, 'insert,update,delete,truncate')
       or has_any_column_privilege('anon', c.oid, 'insert,update'))),
  '{}'::text[],
  'anon cannot write any public table'
);

-- Signed-in users can never write directly to workflow and history tables (RPC only).
select is(
  (select coalesce(array_agg(t order by t), '{}') from unnest(array['residents', 'tenant_memberships', 'audit_logs', 'platform_admins']) t
   where has_table_privilege('authenticated', 'public.' || t, 'insert,update,delete,truncate')
      or has_any_column_privilege('authenticated', 'public.' || t, 'insert,update')),
  '{}'::text[],
  'authenticated cannot write residents, memberships, audit logs or platform admins directly'
);

-- Sensitive resident columns are not readable through normal queries.
select ok(not has_column_privilege('authenticated', 'public.residents', 'emergency_contact_name', 'select'), 'emergency contact name is column-protected');
select ok(not has_column_privilege('authenticated', 'public.residents', 'student_id_number', 'select'), 'student ID number is column-protected');

-- Every public table has at least one policy (RLS on with no policy is fine, but every API table here has one).
select is(
  (select coalesce(array_agg(c.relname::text order by c.relname), '{}') from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)),
  '{}'::text[],
  'every public table has row level security policies'
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
  (select coalesce(array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), '{}')
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('app', 'private') and has_function_privilege('anon', p.oid, 'execute')),
  array['app.resolve_tenant_by_host(text)', 'app.resolve_tenant_by_slug(text)', 'app.tenant_is_active(uuid)']::text[],
  'anon can execute only the host and slug resolvers and tenant_is_active'
);

-- Signed-in users may call only these helpers directly (whitelist grows deliberately in later tasks).
select is(
  (select coalesce(array_agg(p.proname::text order by p.proname), '{}')
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('app', 'private') and has_function_privilege('authenticated', p.oid, 'execute')),
  array['can_view_user_profile', 'delegable_permissions', 'has_break_glass', 'has_permission',
        'is_hostel_admin', 'is_platform_admin', 'is_tenant_member', 'my_resident_id',
        'permission_catalog', 'resolve_tenant_by_host', 'resolve_tenant_by_slug', 'tenant_is_active', 'valid_permissions']::text[],
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
