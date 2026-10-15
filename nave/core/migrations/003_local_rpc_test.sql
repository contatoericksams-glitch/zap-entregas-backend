\set ON_ERROR_STOP on
CREATE SCHEMA auth;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
CREATE TABLE public.app_administrators(user_id uuid PRIMARY KEY);
CREATE TABLE public.driver_profiles(user_id uuid PRIMARY KEY,driver_code text);
CREATE TABLE public.nave_wa_driver_test_channels(driver_id uuid PRIMARY KEY,test_enabled boolean,is_test_only boolean,verified_at timestamptz,availability_state text,last_inbound_at timestamptz);
INSERT INTO public.app_administrators VALUES ('11111111-1111-4111-8111-111111111111');
INSERT INTO public.driver_profiles VALUES ('22222222-2222-4222-8222-222222222222','NAVE-0001');
INSERT INTO public.nave_wa_driver_test_channels VALUES ('22222222-2222-4222-8222-222222222222',true,true,now(),'online',now());
CREATE FUNCTION public.nave_is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.app_administrators WHERE user_id=(SELECT auth.uid()));
$$;
GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;
GRANT EXECUTE ON FUNCTION auth.uid(),auth.jwt() TO authenticated,anon;
GRANT EXECUTE ON FUNCTION public.nave_is_admin() TO authenticated;
\i nave/core/migrations/002_pilot_test_status_DRAFT.sql
DO $$
BEGIN
 IF has_function_privilege('anon','public.nave_v5_pilot_test_status()','EXECUTE') THEN
   RAISE EXCEPTION 'FAIL: anonymous can invoke RPC';
 END IF;
END $$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','',false);
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',false);
DO $$ BEGIN IF public.nave_v5_pilot_test_status() THEN RAISE EXCEPTION 'FAIL: missing login'; END IF; END $$;
SELECT set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
DO $$ BEGIN IF public.nave_v5_pilot_test_status() THEN RAISE EXCEPTION 'FAIL: non-admin'; END IF; END $$;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
SELECT set_config('request.jwt.claims','{"aal":"aal1"}',false);
DO $$ BEGIN IF public.nave_v5_pilot_test_status() THEN RAISE EXCEPTION 'FAIL: admin without MFA'; END IF; END $$;
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',false);
DO $$ BEGIN IF NOT public.nave_v5_pilot_test_status() THEN RAISE EXCEPTION 'FAIL: admin with MFA'; END IF; END $$;
RESET ROLE;
UPDATE public.nave_wa_driver_test_channels SET last_inbound_at=now()-interval '25 hours';
SET ROLE authenticated;
DO $$ BEGIN IF public.nave_v5_pilot_test_status() THEN RAISE EXCEPTION 'FAIL: expired conversation window'; END IF; END $$;
RESET ROLE;
SELECT 'PASS: PostgreSQL permission and eligibility scenarios' AS result;
