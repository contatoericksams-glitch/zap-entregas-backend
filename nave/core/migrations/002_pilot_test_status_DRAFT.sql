-- NAVE V5 PROPOSAL ONLY: NOT APPLIED TO PRODUCTION.
-- Server-side read-only readiness, authenticated admin with aal2 only.
-- Deliberately does NOT expose phone numbers, driver IDs or driver profiles.
begin;
create or replace function public.nave_v5_pilot_test_status()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select auth.uid() is not null
       and coalesce(auth.jwt()->>'aal','') = 'aal2'
       and public.nave_is_admin()
       and exists (
         select 1
         from public.nave_wa_driver_test_channels c
         join public.driver_profiles p on p.user_id = c.driver_id
         where c.test_enabled = true
           and c.is_test_only = true
           and c.verified_at is not null
           and c.availability_state = 'online'
           and c.last_inbound_at > now() - interval '23 hours'
           and p.driver_code = 'NAVE-0001'
       )
    ),false);
$$;
revoke all on function public.nave_v5_pilot_test_status() from public, anon, authenticated;
grant execute on function public.nave_v5_pilot_test_status() to authenticated;
comment on function public.nave_v5_pilot_test_status() is
'Admin MFA only; returns pilot test notification eligibility, no PII. No mutation or dispatch.';
commit;
