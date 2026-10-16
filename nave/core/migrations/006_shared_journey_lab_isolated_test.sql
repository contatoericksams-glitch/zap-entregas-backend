\set ON_ERROR_STOP on
-- Ephemeral postgres: simulate verified Supabase JWT context and two admin browser clients.
CREATE SCHEMA auth;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
$$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;
GRANT EXECUTE ON FUNCTION auth.uid(),auth.jwt() TO authenticated,anon;
CREATE TABLE public.app_administrators (user_id uuid primary key);
INSERT INTO public.app_administrators VALUES ('11111111-1111-4111-8111-111111111111');
CREATE FUNCTION public.nave_is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS
$$ SELECT EXISTS(SELECT 1 FROM public.app_administrators WHERE user_id=auth.uid()) $$;
GRANT EXECUTE ON FUNCTION public.nave_is_admin() TO authenticated;
\i /tmp/nave-shared-lab-migration.sql
DO $test$ BEGIN
 IF has_table_privilege('anon','public.nave_v5_lab_sessions','SELECT')
 OR has_table_privilege('authenticated','public.nave_v5_lab_sessions','SELECT')
 OR has_table_privilege('authenticated','public.nave_v5_lab_sessions','INSERT')
 OR has_table_privilege('authenticated','public.nave_v5_lab_events','SELECT')
 OR has_function_privilege('anon','public.nave_v5_lab_snapshot(uuid)','EXECUTE')
 OR has_function_privilege('anon','public.nave_v5_lab_start(text,text,uuid)','EXECUTE')
 OR has_function_privilege('anon','public.nave_v5_lab_advance(uuid,integer,uuid,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'FAIL: direct table access or anon RPC'; END IF;
END $test$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
SELECT set_config('request.jwt.claims','{"aal":"aal1"}',false);
DO $test$ BEGIN
 IF public.nave_v5_lab_start('eco','normal','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') IS NOT NULL
 THEN RAISE EXCEPTION 'FAIL: MFA AAL1 created lab session'; END IF;
END $test$;
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',false);
DO $test$ DECLARE j jsonb; again jsonb; BEGIN
 j:=public.nave_v5_lab_start('eco','normal','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 IF j->>'phase'<>'offer_pending' OR j->>'driverCode'<>'DEMO-BETA' OR
    j->>'fareCents'<>'1300' OR j->>'whatsappSendEnabled'<>'false' OR
    j->>'commercialRidesEnabled'<>'false' OR j->>'paymentsEnabled'<>'false' OR
    j->>'realGpsUsed'<>'false'
 THEN RAISE EXCEPTION 'FAIL: unsafe or incorrect starting state %', j; END IF;
 again:=public.nave_v5_lab_start('eco','normal','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 IF j->>'id' IS DISTINCT FROM again->>'id' THEN RAISE EXCEPTION 'FAIL: create idempotency'; END IF;
 PERFORM set_config('nave.test.session',j->>'id',false);
END $test$;
DO $test$ DECLARE id uuid; j jsonb; repeat jsonb; conflict jsonb; BEGIN
 id:=current_setting('nave.test.session')::uuid;
 IF public.nave_v5_lab_snapshot(id)->>'version'<>'1' THEN
  RAISE EXCEPTION 'FAIL: independent session read'; END IF;
 IF public.nave_v5_lab_snapshot('33333333-3333-4333-8333-333333333333') IS NOT NULL
 THEN RAISE EXCEPTION 'FAIL: unknown session should not be readable';END IF;
 IF public.nave_v5_lab_advance(id,1,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','accept','passenger') IS NOT NULL
 THEN RAISE EXCEPTION 'FAIL: passenger can accept';END IF;
 j:=public.nave_v5_lab_advance(id,1,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','accept','driver');
 IF j->>'phase'<>'driver_to_pickup' OR j->>'version'<>'2'
 THEN RAISE EXCEPTION 'FAIL: driver acceptance';END IF;
 repeat:=public.nave_v5_lab_advance(id,1,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','accept','driver');
 IF repeat->>'version'<>'2' THEN RAISE EXCEPTION 'FAIL: duplicate request changed version';END IF;
 conflict:=public.nave_v5_lab_advance(id,1,'cccccccc-cccc-4ccc-8ccc-cccccccccccc','arrive','driver');
 IF conflict->>'error'<>'version_conflict' OR conflict->'current'->>'version'<>'2'
 THEN RAISE EXCEPTION 'FAIL: stale version not detected'; END IF;
 j:=public.nave_v5_lab_advance(id,2,'cccccccc-cccc-4ccc-8ccc-cccccccccccc','arrive','driver');
 IF j->>'phase'<>'at_pickup' THEN RAISE EXCEPTION 'FAIL: arrival'; END IF;
 j:=public.nave_v5_lab_advance(id,3,'dddddddd-dddd-4ddd-8ddd-dddddddddddd','board','driver');
 IF j->>'phase'<>'in_trip' THEN RAISE EXCEPTION 'FAIL: boarding';END IF;
 IF public.nave_v5_lab_advance(id,4,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','cancel','passenger') IS NOT NULL
 THEN RAISE EXCEPTION 'FAIL: cancel after boarding';END IF;
 j:=public.nave_v5_lab_advance(id,4,'ffffffff-ffff-4fff-8fff-ffffffffffff','complete','driver');
 IF j->>'phase'<>'completed' OR j->>'version'<>'5'
 THEN RAISE EXCEPTION 'FAIL: completion';END IF;
 IF public.nave_v5_lab_advance(id,5,'12121212-1212-4121-8121-121212121212','arrive','driver') IS NOT NULL
 THEN RAISE EXCEPTION 'FAIL: terminal state modified';END IF;
END $test$;

DO $test$ DECLARE id uuid;j jsonb; BEGIN
 j:=public.nave_v5_lab_start('eco','normal','11111111-1111-4111-8111-111111111112');
 id:=(j->>'id')::uuid;
 j:=public.nave_v5_lab_advance(id,1,'11111111-1111-4111-8111-111111111113','decline','driver');
 IF j->>'driverCode'<>'DEMO-ALFA' OR j->>'phase'<>'offer_pending'
 THEN RAISE EXCEPTION 'FAIL: redistribution';END IF;
 j:=public.nave_v5_lab_advance(id,2,'11111111-1111-4111-8111-111111111114','decline','driver');
 IF j->>'driverCode' IS NOT NULL OR j->>'phase'<>'no_driver'
 THEN RAISE EXCEPTION 'FAIL: no-driver fallback';END IF;
 j:=public.nave_v5_lab_start('navegator','first_busy','11111111-1111-4111-8111-111111111115');
 IF j->>'phase'<>'no_driver' THEN RAISE EXCEPTION 'FAIL: all drivers busy';END IF;
 IF public.nave_v5_lab_start('invalid','normal','11111111-1111-4111-8111-111111111116') IS NOT NULL
 THEN RAISE EXCEPTION 'FAIL: unsupported category'; END IF;
END $test$;
SELECT set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
DO $test$ BEGIN
 IF public.nave_v5_lab_snapshot(current_setting('nave.test.session')::uuid) IS NOT NULL
 THEN RAISE EXCEPTION 'FAIL: other user can read';END IF;
 IF public.nave_v5_lab_start('eco','normal','11111111-1111-4111-8111-111111111117') IS NOT NULL
 THEN RAISE EXCEPTION 'FAIL: non-admin can create';END IF;
 IF public.nave_v5_lab_advance(current_setting('nave.test.session')::uuid,5,
 '11111111-1111-4111-8111-111111111118','complete','driver') IS NOT NULL
 THEN RAISE EXCEPTION 'FAIL: non-admin can advance';END IF;
END $test$;
RESET ROLE;
UPDATE public.nave_v5_lab_sessions SET expires_at=now()-interval '1 second'
 WHERE id=current_setting('nave.test.session')::uuid;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
DO $test$ BEGIN
 IF public.nave_v5_lab_snapshot(current_setting('nave.test.session')::uuid) IS NOT NULL
 THEN RAISE EXCEPTION 'FAIL: expired lab visible';END IF;
END $test$;
RESET ROLE;
SELECT count(*) AS fictional_rows_only FROM public.nave_v5_lab_sessions;
SELECT 'PASS shared fictional sessions MFA / idempotency / version / role / expiry / privacy' AS result;
