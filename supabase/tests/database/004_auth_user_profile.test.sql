-- A user profile is created automatically when Supabase Auth creates a user.
begin;
select plan(3);

insert into auth.users (id, email, raw_user_meta_data)
values ('dddddddd-0000-4000-8000-000000000004', 'new@example.com', '{"display_name": "  Efua Asante  "}');

select ok(exists (select 1 from public.user_profiles where id = 'dddddddd-0000-4000-8000-000000000004'),
  'profile created for the new auth user');
select is((select display_name from public.user_profiles where id = 'dddddddd-0000-4000-8000-000000000004'),
  'Efua Asante', 'display name copied from sign-up metadata and trimmed');

insert into auth.users (id, email) values ('dddddddd-0000-4000-8000-000000000005', 'quiet@example.com');
select is((select display_name from public.user_profiles where id = 'dddddddd-0000-4000-8000-000000000005'),
  null, 'display name is optional');

select * from finish();
rollback;
