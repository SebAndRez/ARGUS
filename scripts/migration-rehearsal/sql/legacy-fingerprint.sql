-- scripts/migration-rehearsal/sql/legacy-fingerprint.sql
--
-- One line per legacy `public` table: LEGACY_FP|<table>|<row count>|<md5 of
-- every row, in a stable order>. Captured right after the legacy baseline
-- loads and again after the target waves (and after the full rollback): the
-- target migration must never modify, add or remove a legacy row, so the
-- lines must be identical. Read-only.
\pset format unaligned
\pset tuples_only on
DO $$
DECLARE
  t record;
  c bigint;
  h text;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname
  LOOP
    EXECUTE format('SELECT count(*), md5(coalesce(string_agg(x::text, E''\n'' ORDER BY x::text), '''')) FROM public.%I x', t.relname) INTO c, h;
    RAISE NOTICE 'LEGACY_FP|%|%|%', t.relname, c, h;
  END LOOP;
END $$;
