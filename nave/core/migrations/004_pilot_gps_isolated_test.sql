\set ON_ERROR_STOP on
CREATE SCHEMA auth;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated;
GRANT EXECUTE ON FUNCTION auth.uid(),auth.jwt() TO anon,authenticated;
CREATE TABLE public.driver_profiles(user_id uuid PRIMARY KEY,driver_code text);
CREATE TABLE public.nave_wa_driver_test_channels(driver_id uuid primary key,
test_enabled boolean,is_test_only boolean,verified_at timestamptz,availability_state text);
CREATE TABLE public.vehicles(driver_id uuid,powertrain text);
CREATE TABLE public.app_administrators(user_id uuid PRIMARY KEY);
INSERT INTO public.driver_profiles VALUES('11111111-1111-4111-8111-111111111111','NAVE-0001');
INSERT INTO public.nave_wa_driver_test_channels VALUES('11111111-1111-4111-8111-111111111111',true,true,now(),'online');
INSERT INTO public.vehicles VALUES('11111111-1111-4111-8111-111111111111','electric');
INSERT INTO public.app_administrators VALUES('11111111-1111-4111-8111-111111111111');
CREATE FUNCTION public.nave_is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
SELECT EXISTS(SELECT 1 FROM public.app_administrators WHERE user_id=auth.uid())$$;
GRANT EXECUTE ON FUNCTION public.nave_is_admin() TO authenticated;
\i /tmp/nave-gps-migration.sql
DO $$ BEGIN
 IF has_table_privilege('authenticated','public.nave_v5_pilot_locations','SELECT') OR
    has_table_privilege('authenticated','public.nave_v5_pilot_locations','INSERT') OR
    has_table_privilege('anon','public.nave_v5_pilot_locations','SELECT') OR
    has_function_privilege('anon','public.nave_v5_set_pilot_gps(double precision,double precision,double precision,boolean)','EXECUTE')
 THEN RAISE EXCEPTION 'FAIL: client privilege exposed';END IF;
END$$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
SELECT set_config('request.jwt.claims','{"aal":"aal1"}',false);
DO $$BEGIN IF public.nave_v5_set_pilot_gps(-24.73,-53.74,12,true) THEN RAISE EXCEPTION 'FAIL: AAL1 can send GPS';END IF;END$$;
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',false);
DO $$BEGIN IF public.nave_v5_set_pilot_gps(-24.73,-53.74,12,false) THEN RAISE EXCEPTION 'FAIL: no consent';END IF;END$$;
DO $$BEGIN IF public.nave_v5_set_pilot_gps(-24.73,-53.74,150,true) THEN RAISE EXCEPTION 'FAIL: low accuracy';END IF;END$$;
DO $$BEGIN IF public.nave_v5_set_pilot_gps(-23.1,-46.6,12,true) THEN RAISE EXCEPTION 'FAIL: outside region';END IF;END$$;
DO $$BEGIN IF NOT public.nave_v5_set_pilot_gps(-24.73,-53.74,12,true) THEN RAISE EXCEPTION 'FAIL: verified pilot GPS';END IF;END$$;
DO $$DECLARE j jsonb;BEGIN
 SELECT public.nave_v5_nearest_pilot_demo(-24.731,-53.741,'eco') INTO j;
 IF j->>'driverCode'<>'NAVE-0001' OR j->>'whatsappSendEnabled'<>'false'
 THEN RAISE EXCEPTION 'FAIL: safe nearest pilot preview';END IF;
END$$;
-- Simulated pickup 2.1 km away from the GPS, not at the pilot's current location.
DO $DECLARE j jsonb; meters integer; cat text; BEGIN
  FOREACH cat IN ARRAY ARRAY['eco','confort','executive','navegator'] LOOP
    SELECT public.nave_v5_nearest_pilot_demo(-24.749,-53.74,cat) INTO j;
    meters := (j->>'distanceMeters')::int;
    IF j->>'driverCode' <> 'NAVE-0001' OR meters < 1900 OR meters > 2400 OR
       j->>'whatsappSendEnabled' <> 'false' OR j->>'commercialRidesEnabled' <> 'false'
    THEN RAISE EXCEPTION 'FAIL: pickup-distance simulation category %, distance %',cat,meters; END IF;
  END LOOP;
  IF public.nave_v5_nearest_pilot_demo(-24.749,-53.74,'commercial') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: unsupported category';
  END IF;
END$;
RESET ROLE;
UPDATE public.nave_v5_pilot_locations SET expires_at=now()-interval '2 minutes';
SET ROLE authenticated;
DO $$BEGIN IF public.nave_v5_nearest_pilot_demo(-24.731,-53.741,'eco') IS NOT NULL
THEN RAISE EXCEPTION 'FAIL: expired GPS eligible';END IF;END$$;
DO $$BEGIN IF NOT public.nave_v5_stop_pilot_gps() THEN RAISE EXCEPTION 'FAIL: stop GPS';END IF;END$$;
RESET ROLE;
DO $$BEGIN IF EXISTS(SELECT 1 FROM public.nave_v5_pilot_locations) THEN RAISE EXCEPTION 'FAIL: GPS not removed on stop';END IF;END$$;
UPDATE public.nave_wa_driver_test_channels SET availability_state='offline';
SET ROLE authenticated;
DO $$BEGIN IF public.nave_v5_set_pilot_gps(-24.73,-53.74,12,true) THEN RAISE EXCEPTION 'FAIL: offline GPS accepted';END IF;END$$;
SELECT set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
DO $$BEGIN IF public.nave_v5_set_pilot_gps(-24.73,-53.74,12,true) THEN RAISE EXCEPTION 'FAIL: nonpilot GPS accepted';END IF;END$$;
DO $$BEGIN IF public.nave_v5_nearest_pilot_demo(-24.73,-53.74,'eco') IS NOT NULL
THEN RAISE EXCEPTION 'FAIL: non-admin location query';END IF;END$$;
RESET ROLE;
SELECT 'PASS: consent, AAL2, driver restriction, GPS validity, TTL, restricted read and stop' AS result;
