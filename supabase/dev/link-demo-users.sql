-- DEVELOPMENT ONLY. Links demo accounts to the two demo hostels from seed.sql.
-- Never run against production.
--
-- Step 1: create the accounts in Supabase Dashboard -> Authentication -> Users -> Add user
--         ("Create new user", tick "Auto Confirm User"). Passwords: at least 12 characters.
--         The student account must be a real inbox you can read (it signs in with an email code).
-- Step 2: if you used different emails, edit them in the `demo` list below.
-- Step 3: paste this whole file into the SQL Editor and run it. Safe to run again.

with demo (email, kind, tenant_slug, permission_set_key) as (
  values
    ('owner@alderhouse.example',     'hostel_admin',   'alder-house', null),
    ('frontdesk@alderhouse.example', 'staff',          'alder-house', 'front_desk'),
    ('accounts@alderhouse.example',  'staff',          'alder-house', 'accounts'),
    ('owner@cedarcourt.example',     'hostel_admin',   'cedar-court', null),
    ('platform@adestay.example',     'platform_admin', null,          null)
),
users as (
  select d.*, u.id as user_id
  from demo d
  join auth.users u on lower(u.email) = lower(d.email)
),
staff as (
  insert into public.tenant_memberships (tenant_id, user_id, role, permission_set_id, status, accepted_at)
  select t.id,
         u.user_id,
         case when u.kind = 'hostel_admin' then 'hostel_admin' else 'staff' end,
         (select ps.id from public.permission_sets ps where ps.key = u.permission_set_key and ps.is_system),
         'active',
         now()
  from users u
  join public.tenants t on t.slug = u.tenant_slug
  where u.kind in ('hostel_admin', 'staff')
  on conflict (tenant_id, user_id) where user_id is not null do nothing
  returning 1
),
platform as (
  insert into public.platform_admins (user_id)
  select user_id from users where kind = 'platform_admin'
  on conflict (user_id) do nothing
  returning 1
)
select
  (select count(*) from demo) as demo_accounts_listed,
  (select count(*) from users) as accounts_found_in_auth,
  (select count(*) from staff) as memberships_created,
  (select count(*) from platform) as platform_admins_created;

-- The student: replace the email with the real inbox you used, then run this part too.
insert into public.residents (tenant_id, user_id, full_name, email, status)
select t.id, u.id, 'Demo Student', u.email, 'applicant'
from auth.users u
join public.tenants t on t.slug = 'alder-house'
where lower(u.email) = lower('student@alderhouse.example')
on conflict (tenant_id, user_id) where user_id is not null do nothing;
