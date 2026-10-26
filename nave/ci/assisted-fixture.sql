-- CI fixture ONLY. Never install this helper in a hosted project.
create function public.nave_assisted_fixture_admin(p_actor uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 update nave_assisted.members set role='admin',approved=true where id=p_actor;
end $$;
revoke all on function public.nave_assisted_fixture_admin(uuid) from public,anon,authenticated;
grant execute on function public.nave_assisted_fixture_admin(uuid) to service_role;

create function public.nave_assisted_fixture_security()
returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object(
 'rls', (select bool_and(c.relrowsecurity) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='nave_assisted' and c.relkind='r'),
 'anonymous_execute',pg_catalog.has_function_privilege('anon','public.nave_assisted_command(uuid,boolean,text,uuid,integer,uuid,jsonb)','EXECUTE'),
 'authenticated_execute',pg_catalog.has_function_privilege('authenticated','public.nave_assisted_snapshot(uuid,boolean)','EXECUTE'),
 'direct_member_access',pg_catalog.has_table_privilege('authenticated','nave_assisted.members','SELECT'),
 'contact_rows',(select count(*) from public.nave_wa_contacts)
 );
$$;
revoke all on function public.nave_assisted_fixture_security() from public,anon,authenticated;
grant execute on function public.nave_assisted_fixture_security() to service_role;

create function public.nave_assisted_fixture_expire(p_id uuid)
returns void language sql security definer set search_path='' as $$
 update nave_assisted.rides set offer_expires_at=now()-interval '1 second' where id=p_id and phase='offered';
$$;
revoke all on function public.nave_assisted_fixture_expire(uuid) from public,anon,authenticated;
grant execute on function public.nave_assisted_fixture_expire(uuid) to service_role;
