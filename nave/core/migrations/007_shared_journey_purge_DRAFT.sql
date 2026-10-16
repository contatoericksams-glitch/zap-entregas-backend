-- NAVE V5 shared DEMO journey physical cleanup; install ONLY after 006 migration approved.
-- The RPCs deny any snapshot after expires_at, regardless of whether cleanup ran.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule(
 'nave_v5_shared_journey_expiry_purge',
 '*/10 * * * *',
 $$delete from public.nave_v5_lab_sessions where expires_at <= now()$$
);
