# NAVE Core V5 — Supabase integration gate

Status: **prepared, not applied**. Automated tests: 29 passing on GitHub Actions
(run 38795793031, commit d8c42758fd2722a0732c2f13ffa638796992754d).
No production changes, schema migration, commercial dispatch or payments.

## Verified database baseline (read only)
- public.nave_wa_ride_requests: RLS enabled, no direct anon/authenticated grants,
  service_role access only. WhatsApp contacts use passenger_contact_id.
- public.ride_quotes: SELECT granted to authenticated with own-passenger RLS.
  Valid category check currently only comfort/executiva, incompatible with 4-category catalog.
- public.rides: SELECT granted to authenticated with participant RLS; unique quote_id.
- Existing WhatsApp ride records are test-only. Do not migrate them automatically.

## Transactional integration requirements
1. Keep the draft idempotency-ledger migration unexecuted until a security review;
   validate actual existing grants and apply least privilege.
2. Backend verifies the user JWT via Supabase Auth (web/app), or verifies the incoming
   Meta webhook signature and resolves the WhatsApp contact server-side. Never trust
   passenger IDs from the request body.
3. Compute route distance/time and fare on the server, never trust client estimates.
4. Generate SHA-256 idempotency digest + canonical request fingerprint scoped to
   verified identity; require UUID identities and reject key reuse with changed payload (409).
5. Use one database transaction per test request with unique constraint handling:
   new -> insert; same fingerprint -> replay; different fingerprint -> conflict.
   Do not expose service_role key in browser or mobile app.
6. Keep `quote_is_test_only=true`, no driver dispatch, no payment creation.
7. Define canonical user/contact mapping and four-category mapping before writing
   to `ride_quotes` or `rides`. Never fabricate authenticated user IDs for contacts.
8. Add test-only integration suite: concurrent duplicates, spoofed identity, replay,
   conflicting payload, RLS denial, rollback on failure, forbidden commercial actions.
9. Use a separate staging database for write tests, or a transaction that rolls back;
   do not seed or write production data during initial homologation.
10. Secure cleanup/retention policy and LGPD controls before any persistent ledger.

## Gate
Current CI only tests pure JS and local HTTP using mocks. It **does not** validate
Supabase write transactions, policies under real JWTs, MFA enrollment, routing providers,
or driver dispatch. Do not deploy V5 or accept paid rides until all tests pass.
