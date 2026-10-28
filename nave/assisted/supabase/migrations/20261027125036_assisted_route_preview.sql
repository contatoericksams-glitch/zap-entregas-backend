-- Additive upgrade for the isolated assisted pilot only. Old requests remain valid.
-- Application rollback can retain this nullable column; do not drop recorded routes.
begin;
alter table nave_assisted.rides add column if not exists route_preview jsonb;
alter table nave_assisted.rides add constraint assisted_route_preview_shape check (
 route_preview is null or (
  jsonb_typeof(route_preview)='object' and route_preview->>'schemaVersion'='1'
  and route_preview->'testOnly'='true'::jsonb
  and jsonb_typeof(route_preview->'points')='object'
  and jsonb_typeof(route_preview->'geometry')='object'
  and route_preview->'geometry'->>'type'='LineString'
  and jsonb_typeof(route_preview->'geometry'->'coordinates')='array'
  and (route_preview->>'distanceMeters')::numeric between 1 and 70000
  and (route_preview->>'durationSeconds')::numeric between 1 and 14400
  and octet_length(route_preview::text)<262144
 ) is true
);
create or replace function public.nave_assisted_command(p_actor uuid,p_aal2 boolean,p_action text,p_id uuid,p_version integer,p_key uuid,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m nave_assisted.members; r nave_assisted.rides; d nave_assisted.members;
 stored nave_assisted.receipts; fingerprint jsonb; result jsonb; target uuid; next_phase text;
begin
 -- Serializes retries by one identity. Row locks + unique indexes protect distinct identities.
 select * into m from nave_assisted.members where id=p_actor for update;
 if not found or (m.role='admin' and not coalesce(p_aal2,false)) or (m.role='driver' and not m.approved) then raise exception 'forbidden'; end if;
 if p_key is null or p_action is null or p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'invalid_input'; end if;
 if p_action not in ('start','assign','approve_driver','availability','accept','decline','arrive','board','complete','cancel') then raise exception 'invalid_action'; end if;
 if (p_action='start' and m.role<>'passenger') or (p_action in ('assign','approve_driver') and m.role<>'admin') or (p_action in ('availability','accept','decline','arrive','board','complete') and m.role<>'driver') or (p_action='cancel' and m.role not in ('passenger','admin')) then raise exception 'forbidden'; end if;
 fingerprint:=jsonb_build_object('action',p_action,'id',p_id,'version',p_version,'data',p_data);
 select * into stored from nave_assisted.receipts where actor_id=p_actor and request_key=p_key;
 if found then
  if stored.input<>fingerprint then raise exception 'request_key_conflict'; end if;
  return stored.result||jsonb_build_object('replayed',true);
 end if;
 if (select count(*) from nave_assisted.receipts where actor_id=p_actor)>5000 then raise exception 'request_capacity'; end if;
 if p_action in ('availability','approve_driver') then
  if p_id is not null or p_version is distinct from 0 then raise exception 'invalid_input'; end if;
  if p_action='availability' then
   if p_data - 'available'<>'{}'::jsonb or jsonb_typeof(p_data->'available') is distinct from 'boolean' then raise exception 'invalid_input'; end if;
   if exists(select 1 from nave_assisted.rides where driver_id=p_actor and phase not in ('completed','cancelled')) then raise exception 'driver_busy'; end if;
   update nave_assisted.members set available=(p_data->>'available')::boolean where id=p_actor;
  else
   if p_data - 'driverId' - 'approved'<>'{}'::jsonb or jsonb_typeof(p_data->'approved') is distinct from 'boolean' then raise exception 'invalid_input'; end if;
   target:=(p_data->>'driverId')::uuid;
   select * into d from nave_assisted.members where id=target and role='driver' for update;
   if not found then raise exception 'invalid_driver'; end if;
   if exists(select 1 from nave_assisted.rides where driver_id=target and phase not in ('completed','cancelled')) then raise exception 'driver_busy'; end if;
   update nave_assisted.members set approved=(p_data->>'approved')::boolean,available=false where id=target;
   insert into nave_assisted.member_events(actor_id,target_id,approved) values(p_actor,target,(p_data->>'approved')::boolean);
  end if;
  result:=jsonb_build_object('ok',true,'testOnly',true);
 elsif p_action='start' then
  if p_id is not null or p_version is distinct from 0 or p_data - 'pickup' - 'destination' - 'category' - 'routePreview'<>'{}'::jsonb then raise exception 'invalid_input'; end if;
  if jsonb_typeof(p_data->'pickup') is distinct from 'string' or jsonb_typeof(p_data->'destination') is distinct from 'string' or jsonb_typeof(p_data->'category') is distinct from 'string' then raise exception 'invalid_input'; end if;
  insert into nave_assisted.rides(passenger_id,pickup,destination,category,route_preview)
  values(p_actor,trim(p_data->>'pickup'),trim(p_data->>'destination'),p_data->>'category',p_data->'routePreview') returning * into r;
 else
  select * into r from nave_assisted.rides where id=p_id for update;
  if not found or (m.role='passenger' and r.passenger_id<>p_actor) or (m.role='driver' and r.driver_id is distinct from p_actor) then raise exception 'forbidden'; end if;
  if p_version is distinct from r.version then raise exception 'version_conflict'; end if;
  if r.phase='offered' and r.offer_expires_at<=now() and p_action in ('accept','decline') then raise exception 'offer_expired'; end if;
  if p_action<>'assign' and p_data<>'{}'::jsonb then raise exception 'invalid_input'; end if;
  if p_action='assign' then
   if r.phase<>'requested' or p_data - 'driverId'<>'{}'::jsonb then raise exception 'invalid_transition'; end if;
   target:=(p_data->>'driverId')::uuid;
   select * into d from nave_assisted.members where id=target and role='driver' for update;
   if not found or not d.approved or not d.available then raise exception 'driver_unavailable'; end if;
   r.driver_id:=target; next_phase:='offered';
  elsif p_action='accept' and r.phase='offered' then next_phase:='accepted';
  elsif p_action='decline' and r.phase='offered' then next_phase:='requested'; r.driver_id:=null;
  elsif p_action='arrive' and r.phase='accepted' then next_phase:='arrived';
  elsif p_action='board' and r.phase='arrived' then next_phase:='in_trip';
  elsif p_action='complete' and r.phase='in_trip' then next_phase:='completed';
  elsif p_action='cancel' and r.phase in ('requested','offered','accepted','arrived') then next_phase:='cancelled';
  else raise exception 'invalid_transition'; end if;
  update nave_assisted.rides set phase=next_phase,driver_id=r.driver_id,
   offer_expires_at=case when next_phase='offered' then now()+interval '120 seconds' else null end,
   version=version+1,updated_at=now() where id=r.id returning * into r;
 end if;
 if r.id is not null then
  insert into nave_assisted.events(ride_id,actor_id,action,version) values(r.id,p_actor,p_action,r.version);
  result:=jsonb_build_object('rideId',r.id,'version',r.version,'testOnly',true);
 end if;
 insert into nave_assisted.receipts(actor_id,request_key,input,result) values(p_actor,p_key,fingerprint,result);
 return result;
end $$;
revoke all on function public.nave_assisted_enroll(uuid,text,boolean) from public,anon,authenticated;
revoke all on function public.nave_assisted_snapshot(uuid,boolean) from public,anon,authenticated;
revoke all on function public.nave_assisted_command(uuid,boolean,text,uuid,integer,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.nave_assisted_enroll(uuid,text,boolean) to service_role;
grant execute on function public.nave_assisted_snapshot(uuid,boolean) to service_role;
grant execute on function public.nave_assisted_command(uuid,boolean,text,uuid,integer,uuid,jsonb) to service_role;
commit;
