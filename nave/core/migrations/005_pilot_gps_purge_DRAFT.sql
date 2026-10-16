-- Install lightweight PostgreSQL housekeeping; never collects GPS itself.
-- Expiry for matching is 120 seconds even between physical cleanup jobs.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule(
  'nave_v5_pilot_gps_expiry_purge',
  '*/10 * * * *',
  $$delete from public.nave_v5_pilot_locations where expires_at <= now()$$
);
