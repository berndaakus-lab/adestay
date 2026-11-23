-- Phase 3, task 13. public.purge_expired_rate_limits removes only finished buckets.
begin;
select plan(9);

insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000f1', 'user@example.com');

insert into private.rate_limits (bucket_key, window_start, hits) values
  ('test:old', now() - interval '2 days', 5),
  ('test:just-old', now() - interval '1 day' - interval '1 second', 1),
  ('test:boundary', now() - interval '1 day', 1),
  ('test:recent', now() - interval '20 minutes', 5),
  ('test:new', now(), 1);

select ok(not has_function_privilege('anon', 'public.purge_expired_rate_limits()', 'execute'), 'visitors cannot purge');
select ok(not has_function_privilege('authenticated', 'public.purge_expired_rate_limits()', 'execute'), 'signed-in users cannot purge');
select ok(has_function_privilege('service_role', 'public.purge_expired_rate_limits()', 'execute'), 'the server job can purge');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000f1", "role": "authenticated"}', true);
set local role authenticated;
select throws_ok('select public.purge_expired_rate_limits()', '42501', null, 'a signed-in user is refused');
reset role;
select set_config('request.jwt.claims', '', true);

set local role service_role;
select is(public.purge_expired_rate_limits(), 2, 'two finished buckets are removed');
reset role;

select is((select count(*)::int from private.rate_limits where bucket_key in ('test:old', 'test:just-old')), 0, 'buckets over a day old are gone');
select is((select count(*)::int from private.rate_limits where bucket_key in ('test:boundary', 'test:recent', 'test:new')), 3, 'newer buckets are kept');
select is((select hits from private.rate_limits where bucket_key = 'test:recent'), 5, 'a live counter is unchanged');

set local role service_role;
select is(public.purge_expired_rate_limits(), 0, 'running again removes nothing');
reset role;

select * from finish();
rollback;
