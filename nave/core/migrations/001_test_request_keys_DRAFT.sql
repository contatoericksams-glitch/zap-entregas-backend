-- NAVE V5 DRAFT — NOT APPLIED. Review before migration.
-- Isolated test-only idempotency ledger. No alteration of existing ride tables.
create table if not exists public.nave_test_request_keys (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('whatsapp','app','web')),
  identity_kind text not null check (identity_kind in ('contact','auth_user')),
  identity_id uuid not null,
  idempotency_digest text not null check (idempotency_digest ~ '^[a-f0-9]{64}$'),
  request_fingerprint text not null check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  source_record_id uuid,
  is_test_only boolean not null default true check (is_test_only = true),
  created_at timestamptz not null default now(),
  unique (channel, identity_kind, identity_id, idempotency_digest),
  check ((channel = 'whatsapp' and identity_kind = 'contact') or
         (channel in ('app','web') and identity_kind = 'auth_user'))
);
alter table public.nave_test_request_keys enable row level security;
-- No grants or RLS policies: default-deny to anon/authenticated.
-- No SECURITY DEFINER RPC or client insert permissions in this migration.
-- Integration must only use a separately audited backend transaction.
comment on table public.nave_test_request_keys is
'NAVE V5 staging test-only dedup ledger. Not for commercial ride booking.';
