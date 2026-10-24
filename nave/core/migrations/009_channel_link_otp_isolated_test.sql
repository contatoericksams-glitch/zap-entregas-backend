\set ON_ERROR_STOP on
-- Run only in an ephemeral PostgreSQL database. Copy the draft migration to
-- /tmp/nave-channel-link-otp-migration.sql before invoking this script.
-- The final ROLLBACK leaves the ephemeral database without fixture data.
begin;

create schema auth;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create table auth.users(id uuid primary key);
create table public.nave_wa_contacts(
  id uuid primary key,
  phone_e164 text not null unique,
  is_driver boolean not null default false
);
create function auth.role() returns text language sql stable as
$$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
grant usage on schema auth, public to service_role;
grant execute on function auth.role() to service_role;
insert into auth.users(id) values
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222'),
 ('33333333-3333-4333-8333-333333333333'),
 ('44444444-4444-4444-8444-444444444444'),
 ('55555555-5555-4555-8555-555555555555');
insert into public.nave_wa_contacts(id, phone_e164, is_driver) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '+15550000001', false),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '+15550000002', false),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '+15550000003', true);

\i /tmp/nave-channel-link-otp-migration.sql

do $test$ begin
  if has_table_privilege('anon','public.nave_channel_link_challenges','select')
   or has_table_privilege('authenticated','public.nave_channel_link_challenges','select')
   or has_table_privilege('authenticated','public.nave_channel_links','insert')
   or has_function_privilege('anon','public.nave_channel_link_confirm_challenge(uuid,uuid,text,timestamptz)','execute')
   or has_function_privilege('authenticated','public.nave_channel_link_confirm_challenge(uuid,uuid,text,timestamptz)','execute')
  then raise exception 'FAIL: client role has table or RPC access'; end if;
  if not has_function_privilege('service_role','public.nave_channel_link_confirm_challenge(uuid,uuid,text,timestamptz)','execute')
  then raise exception 'FAIL: service role cannot call confirm RPC'; end if;
end $test$;

set role service_role;
select set_config('request.jwt.claim.role','service_role',false);

do $test$ declare r jsonb; v_limited boolean := false; begin
  perform public.nave_channel_link_create_challenge(
    '10000000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', repeat('a',64), now()+interval '10 minutes', 5
  );
  begin
    perform public.nave_channel_link_create_challenge(
      '10000000-0000-4000-8000-000000000002',
      '11111111-1111-4111-8111-111111111111',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', repeat('b',64), now()+interval '10 minutes', 5
    );
  exception when sqlstate 'P0001' then v_limited := true;
  end;
  if not v_limited then raise exception 'FAIL: one-minute resend throttle'; end if;

  r := public.nave_channel_link_confirm_challenge(
    '10000000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111', repeat('b',64), now()
  );
  if r->>'linked' <> 'false' then raise exception 'FAIL: wrong OTP accepted'; end if;
  if (select attempt_count from public.nave_channel_link_challenges where id='10000000-0000-4000-8000-000000000001') <> 1
  then raise exception 'FAIL: wrong OTP attempt was not counted'; end if;

  r := public.nave_channel_link_confirm_challenge(
    '10000000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111', repeat('a',64), now()
  );
  if r->>'linked' <> 'true' or r->>'reason' <> 'linked' then raise exception 'FAIL: valid OTP did not link'; end if;
  r := public.nave_channel_link_confirm_challenge(
    '10000000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111', repeat('a',64), now()
  );
  if r->>'linked' <> 'false' then raise exception 'FAIL: OTP replay accepted'; end if;
end $test$;

do $test$ declare r jsonb; i integer; begin
  perform public.nave_channel_link_create_challenge(
    '20000000-0000-4000-8000-000000000001',
    '22222222-2222-4222-8222-222222222222',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', repeat('c',64), now()+interval '10 minutes', 5
  );
  for i in 1..5 loop
    r := public.nave_channel_link_confirm_challenge(
      '20000000-0000-4000-8000-000000000001',
      '22222222-2222-4222-8222-222222222222', repeat('d',64), now()
    );
  end loop;
  r := public.nave_channel_link_confirm_challenge(
    '20000000-0000-4000-8000-000000000001',
    '22222222-2222-4222-8222-222222222222', repeat('c',64), now()
  );
  if r->>'linked' <> 'false' then raise exception 'FAIL: locked-out challenge accepted'; end if;

  perform public.nave_channel_link_create_challenge(
    '20000000-0000-4000-8000-000000000002',
    '44444444-4444-4444-8444-444444444444',
    null, repeat('e',64), now()+interval '10 minutes', 5
  );
  r := public.nave_channel_link_confirm_challenge(
    '20000000-0000-4000-8000-000000000002',
    '44444444-4444-4444-8444-444444444444', repeat('e',64), now()
  );
  if r->>'linked' <> 'false' then raise exception 'FAIL: missing WhatsApp contact linked'; end if;

  perform public.nave_channel_link_create_challenge(
    '30000000-0000-4000-8000-000000000001',
    '33333333-3333-4333-8333-333333333333',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', repeat('f',64), now()+interval '10 minutes', 5
  );
  r := public.nave_channel_link_confirm_challenge(
    '30000000-0000-4000-8000-000000000001',
    '33333333-3333-4333-8333-333333333333', repeat('f',64), now()
  );
  if r->>'linked' <> 'false' or r->>'reason' <> 'already_linked' then
    raise exception 'FAIL: WhatsApp contact was linked to two app users'; end if;

  perform public.nave_channel_link_create_challenge(
    '40000000-0000-4000-8000-000000000001',
    '55555555-5555-4555-8555-555555555555',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', repeat('1',64), now()+interval '10 minutes', 5
  );
  update public.nave_channel_link_challenges set expires_at=now()-interval '1 second'
   where id='40000000-0000-4000-8000-000000000001';
  r := public.nave_channel_link_confirm_challenge(
    '40000000-0000-4000-8000-000000000001',
    '55555555-5555-4555-8555-555555555555', repeat('1',64), now()
  );
  if r->>'linked' <> 'false' then raise exception 'FAIL: expired OTP accepted'; end if;
end $test$;

select 'PASS: OTP throttle, attempt limit, expiry state, one-time use, unique mapping and grants' as result;
reset role;
rollback;
