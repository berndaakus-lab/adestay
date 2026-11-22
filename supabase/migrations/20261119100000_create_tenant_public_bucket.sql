-- Phase 2, task 5. Public storage bucket for hostel branding and room photos, with storage RLS.
-- Design: docs/DATABASE_DESIGN.md §6 (buckets, paths, upload rules); docs/SECURITY_THREAT_MODEL.md T1, T11;
--         Phase 2 acceptance criteria 4 and 6.
--
-- Bucket tenant-public (public read through public URLs, so pictures load without signed URLs):
--   {tenant_id}/branding/<generated>.jpg|png|webp              settings.manage
--   {tenant_id}/room-types/{room_type_id}/<generated>.jpg|...   inventory.manage, room type of that tenant
-- The bucket itself refuses files over 5 MB and any type other than JPEG, PNG and WebP (no SVG).
-- Uploads are made with the user's session (RLS applies); the server validates and re-encodes
-- images before uploading (task 7). Objects are never overwritten: new uploads get new names.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tenant-public', 'tenant-public', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- True when the caller may write (or list/delete) this object name in tenant-public.
-- The name is checked against the exact server-generated shape before any uuid cast, so odd
-- names (traversal, other folders, other extensions) are simply refused.
create function app.can_manage_public_asset(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[];
  v_tenant uuid;
begin
  if p_name is null or p_name !~ '^[0-9a-f-]{36}/(branding|room-types/[0-9a-f-]{36})/[a-z0-9-]{8,64}\.(jpg|png|webp)$' then
    return false;
  end if;
  if p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/' then
    return false;
  end if;

  v_parts := string_to_array(p_name, '/');
  v_tenant := v_parts[1]::uuid;

  if v_parts[2] = 'branding' then
    return app.has_permission(v_tenant, 'settings.manage');
  end if;

  -- room-types/{room_type_id}/file
  if v_parts[3] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return app.has_permission(v_tenant, 'inventory.manage')
     and exists (
       select 1 from public.room_types rt
       where rt.tenant_id = v_tenant and rt.id = v_parts[3]::uuid
     );
end;
$$;

grant execute on function app.can_manage_public_asset(text) to authenticated, service_role;

-- Policies on storage.objects apply to every bucket, so each is limited to tenant-public.
-- No UPDATE policy: objects are never overwritten or renamed through the API.
create policy tenant_public_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'tenant-public' and app.can_manage_public_asset(name));
create policy tenant_public_select on storage.objects for select to authenticated
  using (bucket_id = 'tenant-public' and app.can_manage_public_asset(name));
create policy tenant_public_delete on storage.objects for delete to authenticated
  using (bucket_id = 'tenant-public' and app.can_manage_public_asset(name));

-- Postgres grants EXECUTE on new functions to PUBLIC; keep only the explicit grants above.
revoke execute on all functions in schema app from public;
