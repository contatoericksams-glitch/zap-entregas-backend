-- DRAFT: install ONLY in the unlinked, disposable CI database.
-- No existing NAVE/WhatsApp/ride tables are read or modified.
begin;
create schema nave_assisted;
revoke all on schema nave_assisted from public, anon, authenticated;
create table nave_assisted.members (
 id uuid primary key references auth.users(id),
 name text not null check(length(name) between 2 and 80),
 role text not null check(role in ('passenger','driver','admin')),
 approved boolean not null default false,
 available boolean not null default false
);
create table nave_assisted.rides (
 id uuid primary key default gen_random_uuid(),
 passenger_id uuid not null references nave_assisted.members(id),
 driver_id uuid references nave_assisted.members(id),
 pickup text not null check(length(pickup) between 3 and 240),
 destination text not null check(length(destination) between 3 and 240),
 category text not null check(category in ('eco','confort','executive','navegator')),
 phase text not null default 'requested' check(phase in ('requested','offered','accepted','arrived','in_trip','completed','cancelled')),
 version integer not null default 1,
 offer_expires_at timestamptz,
 test_only boolean not null default true check(test_only),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check((phase='offered')=(offer_expires_at is not null))
);
create unique index assisted_one_active_passenger on nave_assisted.rides(passenger_id) where phase not in ('completed','cancelled');
create unique index assisted_one_active_driver on nave_assisted.rides(driver_id) where driver_id is not null and phase not in ('completed','cancelled');
create table nave_assisted.events (
 id bigint generated always as identity primary key,
 ride_id uuid not null references nave_assisted.rides(id),
 actor_id uuid not null references nave_assisted.members(id),
 action text not null,
 version integer not null,
 at timestamptz not null default now(),
 unique(ride_id,version)
);
create table nave_assisted.receipts (
 actor_id uuid not null references nave_assisted.members(id),
 request_key uuid not null,
 input jsonb not null,
 result jsonb not null,
 created_at timestamptz not null default now(),
 primary key(actor_id,request_key)
);
create table nave_assisted.member_events (
 id bigint generated always as identity primary key,
 actor_id uuid not null references nave_assisted.members(id),
 target_id uuid not null references nave_assisted.members(id),
 approved boolean not null,
 at timestamptz not null default now()
);
alter table nave_assisted.members enable row level security;
alter table nave_assisted.rides enable row level security;
alter table nave_assisted.events enable row level security;
alter table nave_assisted.receipts enable row level security;
alter table nave_assisted.member_events enable row level security;
revoke all on all tables in schema nave_assisted from public,anon,authenticated;
revoke all on all sequences in schema nave_assisted from public,anon,authenticated;

create function public.nave_assisted_enroll(p_actor uuid,p_name text,p_driver boolean default false)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null) then raise exception 'unverified_account'; end if;
 if p_name is null or length(trim(p_name)) not between 2 and 80 or p_driver is null then raise exception 'invalid_profile'; end if;
 insert into nave_assisted.members(id,name,role,approved)
 values(p_actor,trim(p_name),case when p_driver then 'driver' else 'passenger' end,not p_driver)
 on conflict(id) do nothing;
end $$;

create function public.nave_assisted_snapshot(p_actor uuid,p_aal2 boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m nave_assisted.members; result jsonb; expired nave_assisted.rides;
begin
 select * into m from nave_assisted.members where id=p_actor;
 if not found or (m.role='admin' and not coalesce(p_aal2,false)) then raise exception 'forbidden'; end if;
 if m.role='driver' and not m.approved then
  return jsonb_build_object('member',to_jsonb(m),'rides','[]'::jsonb,'events','[]'::jsonb,'drivers','[]'::jsonb,'testOnly',true);
 end if;
 -- Expiration is materialized only after authorization, without touching other users' rides.
 for expired in select * from nave_assisted.rides r
  where r.phase='offered' and r.offer_expires_at<=now()
   and (m.role='admin' or r.passenger_id=p_actor or r.driver_id=p_actor)
  order by r.id for update skip locked
 loop
  update nave_assisted.rides set phase='requested',driver_id=null,offer_expires_at=null,version=version+1,updated_at=now()
   where id=expired.id returning * into expired;
  insert into nave_assisted.events(ride_id,actor_id,action,version) values(expired.id,p_actor,'expire',expired.version);
 end loop;
 with visible as (
  select r.* from nave_assisted.rides r where m.role='admin' or r.passenger_id=p_actor or r.driver_id=p_actor
  order by (r.phase not in ('completed','cancelled')) desc,r.updated_at desc limit 50
 ) select jsonb_build_object(
 'member',to_jsonb(m),'testOnly',true,
 'rides',coalesce((select jsonb_agg(to_jsonb(v)||jsonb_build_object('passenger_name',pm.name,'driver_name',dm.name) order by (v.phase not in ('completed','cancelled')) desc,v.updated_at desc,v.id) from visible v join nave_assisted.members pm on pm.id=v.passenger_id left join nave_assisted.members dm on dm.id=v.driver_id),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(to_jsonb(e)) from (select e.* from nave_assisted.events e join visible v on v.id=e.ride_id order by e.id desc limit 500) e),'[]'::jsonb),
 'drivers',case when m.role='admin' then coalesce((select jsonb_agg(to_jsonb(d)) from nave_assisted.members d where d.role='driver'),'[]'::jsonb) else '[]'::jsonb end
 ) into result;
 return result;
end $$;

create function public.nave_assisted_command(p_actor uuid,p_aal2 boolean,p_action text,p_id uuid,p_version integer,p_key uuid,p_data jsonb)
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
  if p_id is not null or p_version is distinct from 0 or p_data - 'pickup' - 'destination' - 'category'<>'{}'::jsonb then raise exception 'invalid_input'; end if;
  if jsonb_typeof(p_data->'pickup') is distinct from 'string' or jsonb_typeof(p_data->'destination') is distinct from 'string' or jsonb_typeof(p_data->'category') is distinct from 'string' then raise exception 'invalid_input'; end if;
  insert into nave_assisted.rides(passenger_id,pickup,destination,category)
  values(p_actor,trim(p_data->>'pickup'),trim(p_data->>'destination'),p_data->>'category') returning * into r;
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
