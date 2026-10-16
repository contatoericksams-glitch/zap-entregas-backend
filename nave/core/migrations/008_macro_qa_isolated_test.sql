\set ON_ERROR_STOP on
-- MACRO-QA P06/P07/P08 — only runs in ephemeral GitHub Postgres, never production Supabase.
-- Run after 006_shared_journey_lab_isolated_test.sql creates the schema and auth stubs.
-- Superuser isolated CI harness may inspect event-count invariants.
-- Authenticated clients still cannot SELECT the event table (tested separately).
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',false);
DO $macro$
DECLARE
 cat text; scen text; session jsonb; original uuid; current jsonb;
 id uuid; event_count integer; fare integer; expected_driver text; seq integer:=0;
 request_key uuid; next_key uuid;
BEGIN
 FOREACH cat IN ARRAY ARRAY['eco','confort','executive','navegator'] LOOP
  FOREACH scen IN ARRAY ARRAY['normal','first_busy','no_route'] LOOP
   seq:=seq+1;
   request_key:=md5('NAVE-MACRO-QA-START-'||cat||'-'||scen)::uuid;
   session:=public.nave_v5_lab_start(cat,scen,request_key);
   IF session IS NULL THEN RAISE EXCEPTION 'Macro start returned null % %',cat,scen;END IF;
   id:=(session->>'id')::uuid;
   fare:=(case cat when 'eco' then 1300 when 'confort' then 1543
    when 'executive' then 2549 else 2842 end);
   expected_driver:=(case when scen='no_route' then null
    when scen='first_busy' and cat in ('executive','navegator') then null
    when scen='first_busy' then 'DEMO-ALFA' else 'DEMO-BETA' end);
   IF (session->>'driverCode') IS DISTINCT FROM expected_driver
       OR (session->>'fareCents')::int<>fare
       OR (session->>'version')::int<>1
       OR session->>'whatsappSendEnabled'<>'false'
       OR session->>'commercialRidesEnabled'<>'false'
       OR session->>'paymentsEnabled'<>'false'
       OR session->>'realGpsUsed'<>'false'
       OR session->>'driverAuthenticationReady'<>'false'
    THEN RAISE EXCEPTION 'Invalid persisted state for % % : %',cat,scen,session;END IF;
   original:= (public.nave_v5_lab_start(cat,scen,request_key)->>'id')::uuid;
   IF id <> original THEN RAISE EXCEPTION 'Creation idempotency broken'; END IF;
   IF expected_driver IS NULL THEN
     IF session->>'phase'<>'no_driver' THEN RAISE EXCEPTION 'No-driver must fail closed';END IF;
     IF public.nave_v5_lab_advance(id,1,md5('wrong-accept-'||seq)::uuid,'accept','driver') IS NOT NULL
     THEN RAISE EXCEPTION 'No-driver accepted unexpectedly';END IF;
   ELSE
     IF session->>'phase'<>'offer_pending' THEN RAISE EXCEPTION 'Unexpected offer phase';END IF;
     IF public.nave_v5_lab_advance(id,1,md5('wrong-actor-'||seq)::uuid,'accept','passenger') IS NOT NULL
     THEN RAISE EXCEPTION 'Passenger actor accepted offer';END IF;
     next_key:=md5('correct-accept-'||seq)::uuid;
     session:=public.nave_v5_lab_advance(id,1,next_key,'accept','driver');
     IF session->>'phase'<>'driver_to_pickup' OR (session->>'version')::int<>2
     THEN RAISE EXCEPTION 'Accept failed';END IF;
     current:=public.nave_v5_lab_advance(id,1,next_key,'accept','driver');
     IF current->>'version'<>'2' THEN RAISE EXCEPTION 'Repeated accept changed version';END IF;
     current:=public.nave_v5_lab_advance(id,1,md5('stale-decline-'||seq)::uuid,'decline','driver');
     IF current->>'error'<>'version_conflict'
     THEN RAISE EXCEPTION 'Stale action not rejected';END IF;
     session:=public.nave_v5_lab_advance(id,2,md5('arrive-'||seq)::uuid,'arrive','driver');
     IF session->>'phase'<>'at_pickup' THEN RAISE EXCEPTION 'Arrival failed';END IF;
     session:=public.nave_v5_lab_advance(id,3,md5('board-'||seq)::uuid,'board','driver');
     IF session->>'phase'<>'in_trip' THEN RAISE EXCEPTION 'Boarding failed';END IF;
     IF public.nave_v5_lab_advance(id,4,md5('illegal-cancel-'||seq)::uuid,'cancel','passenger') IS NOT NULL
     THEN RAISE EXCEPTION 'Cancel after board permitted';END IF;
     session:=public.nave_v5_lab_advance(id,4,md5('complete-'||seq)::uuid,'complete','driver');
     IF session->>'phase'<>'completed' OR (session->>'version')::int<>5
     THEN RAISE EXCEPTION 'Completion failed';END IF;
   END IF;
   SELECT count(*) INTO event_count FROM public.nave_v5_lab_events e
    WHERE e.session_id=(session->>'id')::uuid;
   IF event_count<>(case when expected_driver is null then 1 else 5 end)
    THEN RAISE EXCEPTION 'Events count inconsistent for % % : %',cat,scen,event_count;END IF;
  END LOOP;
 END LOOP;
 IF seq<>12 THEN RAISE EXCEPTION 'Did not run all categories/scenarios';END IF;
 RAISE NOTICE 'MACRO-QA 12 persisted scenarios validated across all 4 categories';
END $macro$;

-- Bounded active sessions prevent accidental automated load on database.
DO $macro$
DECLARE i integer; key uuid; sess jsonb; rejected jsonb;
BEGIN
 FOR i IN 1..10 LOOP
  key:=md5('NAVE-MACRO-CAP-'||i)::uuid;
  sess:=public.nave_v5_lab_start('eco','normal',key);
  IF sess IS NULL THEN RAISE EXCEPTION 'Cap rejected below 10 live sessions on iteration %',i;END IF;
 END LOOP;
 rejected:=public.nave_v5_lab_start('eco','normal',md5('NAVE-MACRO-CAP-11')::uuid);
 IF rejected IS NOT NULL THEN RAISE EXCEPTION 'Active lab session cap breached';END IF;
 RAISE NOTICE 'MACRO-QA 10-active-session quota verified';
END $macro$;
RESET ROLE;

-- Emulate 30-minute expiration, then verify fail-closed access and physical cleanup.
UPDATE public.nave_v5_lab_sessions SET expires_at=now()-interval '1 second'
 WHERE creation_key=md5('NAVE-MACRO-CAP-1')::uuid;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
DO $macro$
DECLARE v_id uuid;
BEGIN
 SELECT s.id INTO v_id FROM public.nave_v5_lab_sessions s
 WHERE s.creation_key=md5('NAVE-MACRO-CAP-1')::uuid;
 IF public.nave_v5_lab_snapshot(v_id) IS NOT NULL
 THEN RAISE EXCEPTION 'Expired session remains visible';END IF;
END $macro$;
RESET ROLE;
DELETE FROM public.nave_v5_lab_sessions
WHERE expires_at<=now();
DO $macro$ BEGIN
 IF EXISTS(SELECT 1 FROM public.nave_v5_lab_events e
  LEFT JOIN public.nave_v5_lab_sessions s ON e.session_id=s.id WHERE s.id IS NULL)
 THEN RAISE EXCEPTION 'Orphaned events after purge (ON DELETE CASCADE failure)'; END IF;
END $macro$;
SELECT 'PASS MACRO-QA: 12 persisted journeys + all stages + idempotency + staleness + quota + expiry + cascade' AS result;
