-- Ephemeral CI database only. Never run against a hosted project.
create table public.nave_wa_contacts (
  id uuid primary key default gen_random_uuid(),
  phone_e164 text not null unique,
  is_driver boolean not null default false
);
alter table public.nave_wa_contacts enable row level security;
revoke all on public.nave_wa_contacts from public, anon, authenticated;
grant all on public.nave_wa_contacts to service_role;
