-- Phase 2, task 5. tenant-public bucket and storage RLS (docs/DATABASE_DESIGN.md §6,
-- SECURITY_THREAT_MODEL T1/T11; Phase 2 acceptance criteria 4 and 6, database part).
-- Uploads are server-only (20261122100000): can_upload_public_asset is the user-session check the
-- server makes first; direct inserts by API roles are refused; the service role performs the write.
begin;
select plan(30);

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

-- An upload as storage performs it: one row in storage.objects.
create function tests.put(p_name text) returns void
language sql as $$
  insert into storage.objects (bucket_id, name, owner, metadata)
  values ('tenant-public', p_name, auth.uid(), '{"mimetype": "image/webp", "size": 1024}')
$$;

grant execute on all functions in schema tests to anon, authenticated;

-- Folder names used below.
-- A = aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa   room type TA = 20000000-0000-4000-8000-0000000000a1
-- B = bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb   room type TB = 20000000-0000-4000-8000-0000000000b1
-- S = cccccccc-cccc-4ccc-8ccc-cccccccccccc   (suspended)

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin@a.test'),
  ('00000000-0000-4000-8000-0000000000a2', 'frontdesk@a.test'),
  ('00000000-0000-4000-8000-0000000000a4', 'manager@a.test'),
  ('00000000-0000-4000-8000-0000000000b1', 'admin@b.test'),
  ('00000000-0000-4000-8000-0000000000c1', 'admin@s.test'),
  ('00000000-0000-4000-8000-0000000000e1', 'platform@adestay.test');

insert into public.tenants (id, slug, name, reference_prefix, status, suspended_at, suspension_reason) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'hostel-a', 'Hostel A', 'HA', 'active', null, null),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'hostel-b', 'Hostel B', 'HB', 'active', null, null),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'hostel-s', 'Hostel S', 'HS', 'suspended', now(), 'Unpaid subscription');

insert into public.tenant_memberships (tenant_id, user_id, role, permission_set_id, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a1', 'hostel_admin', null, 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a2', 'staff',
     (select id from public.permission_sets where key = 'front_desk' and is_system), 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-0000000000a4', 'staff',
     (select id from public.permission_sets where key = 'manager' and is_system), 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-4000-8000-0000000000b1', 'hostel_admin', null, 'active'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '00000000-0000-4000-8000-0000000000c1', 'hostel_admin', null, 'active');

insert into public.platform_admins (user_id) values ('00000000-0000-4000-8000-0000000000e1');
insert into public.platform_access_grants (platform_admin_user_id, tenant_id, reason, granted_at, expires_at) values
  ('00000000-0000-4000-8000-0000000000e1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Checking a broken room photo',
   now() - interval '5 minutes', now() + interval '1 hour');

insert into public.room_types (id, tenant_id, name, slug, occupancy) values
  ('20000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'A Double', 'double', 2),
  ('20000000-0000-4000-8000-0000000000b1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'B Double', 'double', 2);

-- Objects already uploaded by the server.
insert into storage.objects (bucket_id, name) values
  ('tenant-public', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/branding/logo-b0000001.png'),
  ('tenant-public', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/branding/logo-a0000001.webp'),
  ('tenant-public', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/room-types/20000000-0000-4000-8000-0000000000a1/photo-a0000001.jpg');

-- ---------------------------------------------------------------------------------------------
-- Bucket configuration (criterion 4: size and type limits at the storage layer)
-- ---------------------------------------------------------------------------------------------
select is((select public::text || ' ' || file_size_limit::text from storage.buckets where id = 'tenant-public'), 'true 5242880',
  'tenant-public is public with a 5 MB limit');
select is((select allowed_mime_types from storage.buckets where id = 'tenant-public'),
  array['image/jpeg', 'image/png', 'image/webp'], 'only JPEG, PNG and WebP are accepted (no SVG)');

-- ---------------------------------------------------------------------------------------------
-- Hostel admin of A
-- ---------------------------------------------------------------------------------------------
select tests.as_user('00000000-0000-4000-8000-0000000000a1', 'aal2');
select ok(public.can_upload_public_asset('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/branding/logo-a0000001.webp'), 'admin A: uploads a logo to A''s branding folder');
select ok(public.can_upload_public_asset('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/room-types/20000000-0000-4000-8000-0000000000a1/photo-a0000001.jpg'), 'admin A: uploads a photo for an A room type');
select ok(not public.can_upload_public_asset('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/branding/logo-a0000002.png'), 'admin A: cannot upload into hostel B''s folder');
select ok(not public.can_upload_public_asset('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/room-types/20000000-0000-4000-8000-0000000000b1/photo-a0000002.jpg'), 'admin A: cannot file a photo under hostel B''s room type');
select ok(not public.can_upload_public_asset('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/room-types/20000000-0000-4000-8000-0000000000ff/photo-a0000003.jpg'), 'admin A: cannot upload for a room type that does not exist');
select ok(not public.can_upload_public_asset('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/branding/logo-a0000004.svg'), 'SVG names are refused');
select ok(not public.can_upload_public_asset('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/branding/Logo.PNG'), 'names that are not server-generated are refused');
select ok(not public.can_upload_public_asset('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/branding/../../bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/x-a0000005.png'), 'path traversal is refused');
select ok(not public.can_upload_public_asset('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/payments/receipt-a0000006.png'), 'other folders (e.g. payment evidence) are refused in the public bucket');
select ok(not public.can_upload_public_asset('not-a-uuid-not-a-uuid-not-a-uuid-xxxx/branding/logo-a0000007.png'), 'a malformed tenant folder is refused (no cast error)');
with u as (update storage.objects set name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/branding/logo-a0000008.webp'
            where name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/branding/logo-a0000001.webp' returning 1)
select is((select count(*)::int from u), 0, 'objects cannot be renamed or overwritten (no update policy)');
select is((select count(*)::int from storage.objects), 2, 'admin A: lists only A''s objects');
with d as (delete from storage.objects where name like 'bbbbbbbb%' returning 1)
select is((select count(*)::int from d), 0, 'admin A: cannot delete B''s objects');
with d as (delete from storage.objects where name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/branding/logo-a0000001.webp' returning 1)
select is((select count(*)::int from d), 1, 'admin A: can delete A''s own object');
select tests.as_owner();

-- ---------------------------------------------------------------------------------------------
-- Staff of A: permission decides the folder
-- ---------------------------------------------------------------------------------------------
select tests.as_user('00000000-0000-4000-8000-0000000000a4');
select ok(public.can_upload_public_asset('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/room-types/20000000-0000-4000-8000-0000000000a1/photo-a0000009.webp'), 'manager (inventory.manage): uploads room photos');
select ok(not public.can_upload_public_asset('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/branding/logo-a0000010.png'), 'manager (no settings.manage): cannot change branding');
select tests.as_owner();

select tests.as_user('00000000-0000-4000-8000-0000000000a2');
select ok(not public.can_upload_public_asset('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/room-types/20000000-0000-4000-8000-0000000000a1/photo-a0000011.webp'), 'front desk (inventory.read only): cannot upload');
select is((select count(*)::int from storage.objects), 0, 'front desk: cannot list the bucket');
select tests.as_owner();

-- ---------------------------------------------------------------------------------------------
-- Everyone else
-- ---------------------------------------------------------------------------------------------
select tests.as_user('00000000-0000-4000-8000-0000000000c1', 'aal2');
select ok(not public.can_upload_public_asset('cccccccc-cccc-4ccc-8ccc-cccccccccccc/branding/logo-c0000001.png'), 'admin of a suspended hostel: cannot upload');
select tests.as_owner();

select tests.as_user('00000000-0000-4000-8000-0000000000e1', 'aal2');
select ok(not public.can_upload_public_asset('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/branding/logo-e0000001.png'), 'platform admin with break-glass: cannot upload (read-only)');
select tests.as_owner();

select tests.as_anon();
select throws_ok($$select tests.put('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/branding/logo-x0000001.png')$$,
  '42501', null, 'anon: cannot upload');
select is((select count(*)::int from storage.objects), 0, 'anon: cannot list objects (public files are served by URL only)');
select tests.as_owner();

select is((select count(*)::int from storage.objects where name like 'bbbbbbbb%'), 1, 'B''s logo is untouched');

-- ---------------------------------------------------------------------------------------------
-- Server-only uploads
-- ---------------------------------------------------------------------------------------------
select is((select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd = 'INSERT'), 0,
  'no API role has an insert policy on storage.objects');
select ok(not has_function_privilege('anon', 'public.can_upload_public_asset(text)', 'execute'), 'anon: cannot call the upload check');

select tests.as_user('00000000-0000-4000-8000-0000000000a1', 'aal2');
select throws_ok($$select tests.put('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/branding/logo-d0000001.webp')$$,
  '42501', null, 'admin A: cannot upload directly with their session');
select tests.as_owner();

select tests.as_user('00000000-0000-4000-8000-0000000000a4');
select throws_ok($$select tests.put('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/room-types/20000000-0000-4000-8000-0000000000a1/photo-d0000002.webp')$$,
  '42501', null, 'manager: cannot upload directly with their session');
select tests.as_owner();

set local role service_role;
select lives_ok($$insert into storage.objects (bucket_id, name) values
  ('tenant-public', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/branding/logo-d0000003.webp')$$,
  'the server (service role) can upload after its checks');
reset role;

select * from finish();
rollback;
