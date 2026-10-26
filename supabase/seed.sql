-- Development seed data only. Never run against production.
-- Two demo hostels so tenant isolation can be exercised from day one.
-- Demo users (admins, staff, students) are created through Supabase Auth in Phase 1 task 6.

insert into public.tenants (id, slug, name, legal_name, reference_prefix, status) values
  ('11111111-1111-4111-8111-111111111111', 'alder-house', 'Alder House', 'Alder House Hostel Ltd', 'ALD', 'active'),
  ('22222222-2222-4222-8222-222222222222', 'cedar-court', 'Cedar Court', 'Cedar Court Residence', 'CDR', 'active')
on conflict (id) do nothing;

-- *.localhost resolves to 127.0.0.1 in every modern browser: no hosts-file edits needed.
insert into public.tenant_domains (tenant_id, hostname, kind, status, is_primary, verified_at) values
  ('11111111-1111-4111-8111-111111111111', 'alder-house.localhost', 'platform_subdomain', 'verified', true, now()),
  ('22222222-2222-4222-8222-222222222222', 'cedar-court.localhost', 'platform_subdomain', 'verified', true, now())
on conflict do nothing;

insert into public.tenant_profiles (tenant_id, display_name, tagline, about, primary_color, contact_phone, contact_email,
                                    whatsapp_phone, address, digital_address, landmark_directions, is_published) values
  ('11111111-1111-4111-8111-111111111111', 'Alder House', 'A place to live. A place to belong.',
   'Calm private rooms and welcoming shared spaces, a short walk from campus.', '#234536',
   '+233241234567', 'hello@alderhouse.example', '+233241234567',
   'Okponglo, East Legon, Accra', 'GA-123-4567', 'Behind the Okponglo footbridge, second gate on the left.', true),
  ('22222222-2222-4222-8222-222222222222', 'Cedar Court', 'Student living, done properly.',
   'Secure, well-kept rooms with study spaces and reliable Wi-Fi.', '#2f5d74',
   '+233201234567', 'hello@cedarcourt.example', '+233201234567',
   'Ayeduase, Kumasi', 'AK-456-7890', 'Opposite the Ayeduase market lorry station.', true)
on conflict (tenant_id) do nothing;

insert into public.tenant_settings (tenant_id, deposit_policy, deposit_value) values
  ('11111111-1111-4111-8111-111111111111', 'fixed', 59000),
  ('22222222-2222-4222-8222-222222222222', 'percent', 50)
on conflict (tenant_id) do nothing;
