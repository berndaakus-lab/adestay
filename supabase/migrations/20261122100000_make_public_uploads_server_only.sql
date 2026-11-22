-- Phase 2, task 5 (revised). Uploads to tenant-public are server-only (product owner, in chat, 2026-11-22).
-- Design: docs/SECURITY_THREAT_MODEL.md T11; docs/DATABASE_DESIGN.md §6; Phase 2 acceptance criterion 4.
--
-- A staff session can no longer write to the bucket directly, so no public image can skip the server's
-- content check and EXIF-stripping re-encode. The upload module (src/lib/server/uploads, task 7):
--   1. calls public.can_upload_public_asset(name) WITH THE USER'S SESSION, so the database decides;
--   2. validates and re-encodes the file;
--   3. uploads with the service role.
-- Listing and deleting a hostel's own objects keep their existing user-session policies.

drop policy tenant_public_insert on storage.objects;

create function public.can_upload_public_asset(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and app.can_manage_public_asset(p_name)
$$;

revoke execute on function public.can_upload_public_asset(text) from public, anon;
grant execute on function public.can_upload_public_asset(text) to authenticated, service_role;
