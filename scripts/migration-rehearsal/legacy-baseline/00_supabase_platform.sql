-- scripts/migration-rehearsal/legacy-baseline/00_supabase_platform.sql
--
-- LOCAL REHEARSAL ONLY. Makes the disposable postgis/postgis container look
-- like the shared Supabase project as measured READ-ONLY in the Paso 3
-- preflight (docs/architecture/private/ARGUS_SUPABASE_PREFLIGHT_v1.0.md §1),
-- so that migrations are rehearsed against production's platform layout and
-- not against a vanilla Postgres that hides platform-specific failures.
--
-- Runs at the end of Reset-ArgusRehearsal.ps1, i.e. BEFORE the empty-catalog
-- baseline snapshot: everything here is "platform", never ARGUS residue.
-- Idempotent.
--
-- What production has, reproduced here:
--   * PostGIS NOT installed (the postgis/postgis image pre-installs it plus
--     topology/tiger/fuzzystrmatch into the default database; removed here).
--   * pgcrypto and uuid-ossp installed in schema `extensions`, not `public`.
--   * The connecting role's search_path = "$user", public, extensions
--     (production role `postgres`, pg_db_role_setting).
--   * Database TimeZone = UTC.
--   * API roles anon / authenticated / service_role (NOLOGIN) and the
--     default privileges production grants them on new `public` tables
--     (TRUNCATE, REFERENCES, TRIGGER, MAINTAIN — SELECT/INSERT/UPDATE/DELETE
--     already revoked in production).
--   * The `ensure_rls` event trigger -> public.rls_auto_enable(): enables RLS
--     on every table created in `public` (verbatim body from production).
--
-- NOT reproduced (cannot be, locally): supautils/Supavisor, the non-superuser
-- `postgres` role (the harness connects as a local superuser), Supabase's
-- own auth/storage/realtime schemas (no ARGUS wave touches them).

DROP EXTENSION IF EXISTS postgis_tiger_geocoder CASCADE;
DROP EXTENSION IF EXISTS postgis_topology CASCADE;
DROP EXTENSION IF EXISTS fuzzystrmatch CASCADE;
DROP EXTENSION IF EXISTS postgis CASCADE;
DROP SCHEMA IF EXISTS tiger CASCADE;
DROP SCHEMA IF EXISTS tiger_data CASCADE;
DROP SCHEMA IF EXISTS topology CASCADE;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;

GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES TO anon, authenticated, service_role;

DO $$
BEGIN
  EXECUTE format('ALTER ROLE %I SET search_path = "$user", public, extensions', current_user);
  EXECUTE format('ALTER DATABASE %I SET TimeZone = %L', current_database(), 'UTC');
END $$;

-- Verbatim from production (pg_get_functiondef, Paso 3 preflight §4).
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = 'ensure_rls') THEN
    CREATE EVENT TRIGGER ensure_rls ON ddl_command_end
      WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      EXECUTE FUNCTION public.rls_auto_enable();
  END IF;
END $$;

-- Self-check: the platform must now match the preflight's measurements.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
    RAISE EXCEPTION 'SUPABASE_PLATFORM_EMULATION_FAIL: postgis must be absent before wave 010';
  END IF;
  IF (SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'pgcrypto') <> 'extensions' THEN
    RAISE EXCEPTION 'SUPABASE_PLATFORM_EMULATION_FAIL: pgcrypto must live in schema extensions';
  END IF;
  RAISE NOTICE 'SUPABASE_PLATFORM_EMULATION_PASS';
END $$;
