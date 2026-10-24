-- NAVE app <-> WhatsApp account link, with one-time verification.
-- DRAFT ONLY: never apply to the primary NAVE Supabase project.
-- Requires existing auth.users, auth.role(), and public.nave_wa_contacts(id).
-- No client table access; only the server-side service_role can call these RPCs.
-- Do not enable the HTTP route or WhatsApp sender until a staging test is approved.

create table if not exists public.nave_channel_link_challenges (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid references public.nave_wa_contacts(id) on delete set null,
  code_digest text not null check (code_digest ~ '^[0-9a-f]{64}$'),
  attempt_count smallint not null default 0 check (attempt_count between 0 and 5),
  max_attempts smallint not null default 5 check (max_attempts = 5),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  invalidated_at timestamptz,
  created_at timestamptz not null default now(),
  check (consumed_at is null or invalidated_at is null)
);
create index if not exists nave_channel_link_challenges_user_created_idx
  on public.nave_channel_link_challenges(user_id, created_at desc);
create index if not exists nave_channel_link_challenges_expiry_idx
  on public.nave_channel_link_challenges(expires_at);

create table if not exists public.nave_channel_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  contact_id uuid not null unique references public.nave_wa_contacts(id) on delete cascade,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.nave_channel_link_challenges enable row level security;
alter table public.nave_channel_links enable row level security;
revoke all on public.nave_channel_link_challenges from public, anon, authenticated;
revoke all on public.nave_channel_links from public, anon, authenticated;
grant all on public.nave_channel_link_challenges to service_role;
grant all on public.nave_channel_links to service_role;

create or replace function public.nave_channel_link_create_challenge(
  p_challenge_id uuid,
  p_user_id uuid,
  p_contact_id uuid,
  p_code_digest text,
  p_expires_at timestamptz,
  p_max_attempts integer
) returns void
language plpgsql volatile security definer set search_path = '' as $link$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise insufficient_privilege using message = 'service role required';
  end if;
  if p_challenge_id is null or p_user_id is null or
     p_code_digest is null or p_code_digest !~ '^[0-9a-f]{64}$' or
     p_max_attempts <> 5 or p_expires_at <= now() or
     p_expires_at > now() + interval '12 minutes' then
    raise invalid_parameter_value using message = 'invalid challenge';
  end if;

  -- Serialize starts for one app user, then invalidate earlier pending codes.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  update public.nave_channel_link_challenges
     set invalidated_at = now()
   where user_id = p_user_id
     and consumed_at is null and invalidated_at is null;

  if exists (
    select 1 from public.nave_channel_link_challenges
     where user_id = p_user_id and created_at > now() - interval '1 minute'
  ) or (
    select count(*) from public.nave_channel_link_challenges
     where user_id = p_user_id and created_at > now() - interval '1 hour'
  ) >= 5 then
    raise sqlstate 'P0001' using message = 'channel_link_rate_limited';
  end if;

  insert into public.nave_channel_link_challenges
    (id, user_id, contact_id, code_digest, expires_at, max_attempts)
  values
    (p_challenge_id, p_user_id, p_contact_id, p_code_digest, p_expires_at, p_max_attempts);
end;
$link$;

create or replace function public.nave_channel_link_invalidate_challenge(
  p_challenge_id uuid, p_user_id uuid
) returns boolean
language plpgsql volatile security definer set search_path = '' as $link$
declare v_changed integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise insufficient_privilege using message = 'service role required';
  end if;
  update public.nave_channel_link_challenges
     set invalidated_at = now()
   where id = p_challenge_id and user_id = p_user_id
     and consumed_at is null and invalidated_at is null;
  get diagnostics v_changed = row_count;
  return v_changed = 1;
end;
$link$;

create or replace function public.nave_channel_link_confirm_challenge(
  p_challenge_id uuid, p_user_id uuid, p_code_digest text, p_now timestamptz
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $link$
declare
  v public.nave_channel_link_challenges%rowtype;
  v_existing_contact uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise insufficient_privilege using message = 'service role required';
  end if;
  if p_challenge_id is null or p_user_id is null or p_now is null or
     p_code_digest is null or p_code_digest !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('linked', false, 'reason', 'invalid_or_expired');
  end if;

  select * into v
    from public.nave_channel_link_challenges
   where id = p_challenge_id and user_id = p_user_id
   for update;
  if not found or v.consumed_at is not null or v.invalidated_at is not null or
     v.expires_at <= p_now or v.attempt_count >= v.max_attempts then
    return jsonb_build_object('linked', false, 'reason', 'invalid_or_expired');
  end if;
  if v.contact_id is null then
    update public.nave_channel_link_challenges set invalidated_at = p_now where id = v.id;
    return jsonb_build_object('linked', false, 'reason', 'invalid_or_expired');
  end if;
  if v.code_digest <> p_code_digest then
    update public.nave_channel_link_challenges
       set attempt_count = attempt_count + 1,
           invalidated_at = case when attempt_count + 1 >= max_attempts then p_now else null end
     where id = v.id;
    return jsonb_build_object('linked', false, 'reason', 'invalid_or_expired');
  end if;

  select contact_id into v_existing_contact
    from public.nave_channel_links where user_id = p_user_id;
  if found then
    update public.nave_channel_link_challenges set consumed_at = p_now where id = v.id;
    if v_existing_contact = v.contact_id then
      return jsonb_build_object('linked', true, 'reason', 'already_linked');
    end if;
    return jsonb_build_object('linked', false, 'reason', 'already_linked');
  end if;

  begin
    insert into public.nave_channel_links(user_id, contact_id, verified_at)
    values (p_user_id, v.contact_id, p_now);
  exception when unique_violation then
    -- A WhatsApp contact can belong to only one app account.
    select contact_id into v_existing_contact
      from public.nave_channel_links where user_id = p_user_id;
    if found then
      update public.nave_channel_link_challenges set consumed_at = p_now where id = v.id;
      if v_existing_contact = v.contact_id then
        return jsonb_build_object('linked', true, 'reason', 'already_linked');
      end if;
    end if;
    update public.nave_channel_link_challenges set invalidated_at = p_now where id = v.id;
    return jsonb_build_object('linked', false, 'reason', 'already_linked');
  end;

  update public.nave_channel_link_challenges set consumed_at = p_now where id = v.id;
  return jsonb_build_object('linked', true, 'reason', 'linked');
end;
$link$;

-- Expired one-time codes have a one-day retention window. Scheduling this
-- cleanup is a staging decision and is intentionally not part of this draft.
create or replace function public.nave_channel_link_purge_challenges(p_now timestamptz)
returns integer
language plpgsql volatile security definer set search_path = '' as $link$
declare v_deleted integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise insufficient_privilege using message = 'service role required';
  end if;
  delete from public.nave_channel_link_challenges
   where (expires_at < p_now - interval '1 day')
      or (coalesce(consumed_at, invalidated_at) < p_now - interval '1 day');
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$link$;

revoke all on function public.nave_channel_link_create_challenge(uuid,uuid,uuid,text,timestamptz,integer) from public, anon, authenticated;
revoke all on function public.nave_channel_link_invalidate_challenge(uuid,uuid) from public, anon, authenticated;
revoke all on function public.nave_channel_link_confirm_challenge(uuid,uuid,text,timestamptz) from public, anon, authenticated;
revoke all on function public.nave_channel_link_purge_challenges(timestamptz) from public, anon, authenticated;
grant execute on function public.nave_channel_link_create_challenge(uuid,uuid,uuid,text,timestamptz,integer) to service_role;
grant execute on function public.nave_channel_link_invalidate_challenge(uuid,uuid) to service_role;
grant execute on function public.nave_channel_link_confirm_challenge(uuid,uuid,text,timestamptz) to service_role;
grant execute on function public.nave_channel_link_purge_challenges(timestamptz) to service_role;

comment on table public.nave_channel_link_challenges is
  'Short-lived app-to-WhatsApp verification challenges; service-role only; one-day retention target.';
comment on table public.nave_channel_links is
  'Verified one-to-one mapping between a NAVE authenticated user and existing WhatsApp contact.';
