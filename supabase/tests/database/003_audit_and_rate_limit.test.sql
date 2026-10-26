-- Audit trail is automatic, redacted and append-only; rate limits count and reset.
begin;
select plan(12);

insert into public.tenants (id, slug, name, reference_prefix, status) values
  ('a0000000-0000-4000-8000-00000000000a', 'hostel-a', 'Hostel A', 'HA', 'active');

select is(
  (select count(*)::int from public.audit_logs where entity_type = 'tenants' and action = 'tenants.created'
     and tenant_id = 'a0000000-0000-4000-8000-00000000000a'),
  1, 'creating a tenant writes an audit entry'
);

update public.tenants set name = 'Hostel A Renamed' where slug = 'hostel-a';
select is(
  (select after ->> 'name' from public.audit_logs where action = 'tenants.updated' order by id desc limit 1),
  'Hostel A Renamed', 'updates record the new values'
);

update public.tenants set updated_at = now() where slug = 'hostel-a';
select is((select count(*)::int from public.audit_logs where action = 'tenants.updated'), 1,
  'touching only updated_at does not create noise in the audit log');

insert into public.residents (tenant_id, full_name, email, phone_e164, student_id_number,
                              emergency_contact_name, emergency_contact_phone, emergency_contact_relationship)
values ('a0000000-0000-4000-8000-00000000000a', 'Ama Mensah', 'ama@example.com', '+233241234567', 'UG10293847',
        'Kofi Mensah', '+233201112223', 'Father');

select is((select after ->> 'phone_e164' from public.audit_logs where action = 'residents.created'), '***567',
  'resident phone numbers are masked in the audit log');
select is((select after ->> 'emergency_contact_phone' from public.audit_logs where action = 'residents.created'), '***223',
  'emergency contact phone is masked');
select is((select after ->> 'emergency_contact_name' from public.audit_logs where action = 'residents.created'), '[redacted]',
  'emergency contact name is redacted');
select is((select after ->> 'student_id_number' from public.audit_logs where action = 'residents.created'), '[redacted]',
  'student ID number is redacted');
select ok((select not (after ? 'emergency_contact_relationship') from public.audit_logs where action = 'residents.created'),
  'emergency contact relationship is not stored');

select throws_ok($$update public.audit_logs set action = 'tenants.deleted'$$, '42501', null, 'audit entries cannot be changed');
select throws_ok($$delete from public.audit_logs$$, '42501', null, 'audit entries cannot be deleted');

-- Rate limit: 2 hits allowed per window, third refused.
select is(
  array[app.check_rate_limit('test:otp:ama@example.com', 2, interval '1 hour'),
        app.check_rate_limit('test:otp:ama@example.com', 2, interval '1 hour'),
        app.check_rate_limit('test:otp:ama@example.com', 2, interval '1 hour')],
  array[true, true, false],
  'rate limit allows the limit and refuses the next hit'
);
update private.rate_limits set window_start = now() - interval '2 hours' where bucket_key = 'test:otp:ama@example.com';
select ok(app.check_rate_limit('test:otp:ama@example.com', 2, interval '1 hour'), 'rate limit resets after the window');

select * from finish();
rollback;
