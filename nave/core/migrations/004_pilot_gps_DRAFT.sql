-- NAVE V5 GPS PILOT: development migration, no automatic tracking.
-- No data is collected unless the signed-in pilot explicitly starts sharing GPS.
-- Single pilot NAVE-0001 and admin AAL2 only; no production rides.
begin;

create table if not exists public.nave_v5_pilot_locations (
  driver_id uuid primary key references public.driver_profiles(user_id) on delete cascade,
  latitude double precision not null check(latitude between -26.5 and -24.4),
  longitude double precision not null check(longitude between -55.7 and -52.4),
  accuracy_m double precision not null check(accuracy_m > 0 and accuracy_m <= 100),
  recorded_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '120 seconds')
);
alter table public.nave_v5_pilot_locations enable row level security;
-- No SELECT/INSERT/UPDATE/DELETE permissions for client roles, including authenticated.
revoke all on public.nave_v5_pilot_locations from public, anon, authenticated;

create or replace function public.nave_v5_set_pilot_gps(
 p_lat double precision, p_lng double precision, p_accuracy_m double precision, p_consent boolean
) returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  v_id := auth.uid();
  if v_id is null or p_consent is distinct from true or
     coalesce(auth.jwt()->>'aal','') <> 'aal2' or
     p_lat is null or p_lng is null or p_accuracy_m is null or
     not (p_lat between -26.5 and -24.4) or
     not (p_lng between -55.7 and -52.4) or
     not (p_accuracy_m > 0 and p_accuracy_m <= 100) then
     return false;
  end if;
  if not exists(
   select 1 from public.driver_profiles d
   join public.nave_wa_driver_test_channels c on c.driver_id=d.user_id
   where d.user_id=v_id and d.driver_code='NAVE-0001' and
     c.test_enabled=true and c.is_test_only=true and
     c.availability_state='online' and c.verified_at is not null
  ) then return false; end if;
  -- Rate cap: no more than one write every 15 seconds.
  insert into public.nave_v5_pilot_locations
   (driver_id,latitude,longitude,accuracy_m,recorded_at,expires_at)
   values(v_id,p_lat,p_lng,p_accuracy_m,now(),now()+interval '120 seconds')
  on conflict (driver_id) do update set
   latitude=excluded.latitude, longitude=excluded.longitude,
   accuracy_m=excluded.accuracy_m,recorded_at=excluded.recorded_at,
   expires_at=excluded.expires_at
  where public.nave_v5_pilot_locations.recorded_at <= now()-interval '15 seconds';
  return true;
end $$;

create or replace function public.nave_v5_stop_pilot_gps()
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  v_id := auth.uid();
  if v_id is null then return false; end if;
  delete from public.nave_v5_pilot_locations where driver_id=v_id;
  return true;
end $$;

create or replace function public.nave_v5_nearest_pilot_demo(
 p_pickup_lat double precision, p_pickup_lng double precision,
 p_category text
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if auth.uid() is null or coalesce(auth.jwt()->>'aal','') <> 'aal2' or
    not public.nave_is_admin() then return null; end if;
  if p_pickup_lat is null or p_pickup_lng is null or
     not (p_pickup_lat between -26.5 and -24.4) or
     not (p_pickup_lng between -55.7 and -52.4) or
     p_category is null or p_category not in ('eco','confort','executive','navegator')
    then return null; end if;

  select jsonb_build_object(
   'driverCode',d.driver_code,
   'distanceMeters',round((
      2 * 6371000 * asin(sqrt(least(1.0,
       power(sin(radians(l.latitude-p_pickup_lat)/2),2) +
       cos(radians(p_pickup_lat))*cos(radians(l.latitude))*
       power(sin(radians(l.longitude-p_pickup_lng)/2),2)
      )))
   )::numeric),
   'testOnly',true,'whatsappSendEnabled',false,
   'commercialRidesEnabled',false,'liveGpsEnabled',true,
   'distanceMode','straight-line'
  ) into v_result
  from public.nave_v5_pilot_locations l
  join public.driver_profiles d on d.user_id=l.driver_id
  join public.nave_wa_driver_test_channels c on c.driver_id=l.driver_id
  where d.driver_code='NAVE-0001' and
    c.test_enabled=true and c.is_test_only=true and c.verified_at is not null
    and c.availability_state='online' and
    l.expires_at > now() and l.recorded_at > now()-interval '120 seconds'
    and exists (select 1 from public.vehicles v where v.driver_id=l.driver_id and v.powertrain='electric')
  order by (power(l.latitude-p_pickup_lat,2)+power(l.longitude-p_pickup_lng,2)) asc
  limit 1;
  return v_result;
end $$;
revoke all on function public.nave_v5_set_pilot_gps(double precision,double precision,double precision,boolean) from public,anon,authenticated;
revoke all on function public.nave_v5_stop_pilot_gps() from public,anon,authenticated;
revoke all on function public.nave_v5_nearest_pilot_demo(double precision,double precision,text) from public,anon,authenticated;
grant execute on function public.nave_v5_set_pilot_gps(double precision,double precision,double precision,boolean) to authenticated;
grant execute on function public.nave_v5_stop_pilot_gps() to authenticated;
grant execute on function public.nave_v5_nearest_pilot_demo(double precision,double precision,text) to authenticated;
comment on table public.nave_v5_pilot_locations is
'GPS do único piloto voluntário NAVE V5. Sem histórico, expira para seleção após 120 segundos; apagar manualmente em PARAR. Exige rotina futura para purgar registros órfãos.';
commit;
