-- scripts/migration-rehearsal/legacy-baseline/20_realistic_data.sql
--
-- LOCAL REHEARSAL ONLY. Deterministic, entirely fictitious data shaped like
-- production (Paso 3 read-only preflight, 2026-09-22). No real person,
-- incident, facility or coordinate. Replaces the former 22-table synthetic
-- fixture, whose values (lowercase statuses, UUID ids, timestamptz) hid real
-- migration defects.
--
-- Provenance of every distribution:
--   [M] measured in production (evidence/supabase-preflight-2026-09-22)
--   [C] not measured; taken from the code that writes the column
--   [T] deliberate test coverage beyond production (documented per table)
--
-- Conventions reproduced from production:
--   * ids are Prisma cuids ('c' + 24 lowercase alphanumerics), never UUIDs [M]
--   * every DateTime is `timestamp without time zone` holding UTC wall time [M]
--   * KnowledgeIncident.verificationStatus is UPPERCASE [M]
--
-- Deterministic: every column is set explicitly (no DEFAULT now()), so two
-- loads are byte-identical — the rehearsal asserts that before a second
-- install. Idempotent: fixed seeds + ON CONFLICT DO NOTHING. Ends with a blocking
-- self-check that prints LEGACY_BASELINE_DATA_PASS.

CREATE FUNCTION pg_temp.cuid(seed text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT 'c' || substr(md5('argus-legacy:' || seed), 1, 24) $$;

-- Spread n over [2026-06-20, 2026-09-21) (UTC wall time, no zone).
CREATE FUNCTION pg_temp.ts(n integer, total integer) RETURNS timestamp
LANGUAGE sql IMMUTABLE AS $$
  SELECT timestamp '2026-06-20 00:00:00' + ((n::numeric / total) * interval '93 days')
$$;

-- ---------------------------------------------------------------------------
-- User: 7 = 6 CITIZEN + 1 ADMIN [M]. accountStatus/authProvider [C].
-- ---------------------------------------------------------------------------
INSERT INTO "User" (id, name, email, "publicAlias", role, "accountStatus", "authProvider",
  "governmentIdHash", "termsAcceptedAt", "privacyAcceptedAt", "countryCode", city, region,
  "trustScore", "createdAt", "updatedAt")
SELECT pg_temp.cuid('user:' || n),
  'Persona Sintetica ' || n,
  'user' || n || '@example.invalid',
  'alias-' || n,
  CASE WHEN n = 1 THEN 'ADMIN' ELSE 'CITIZEN' END,
  'ACTIVE',
  CASE WHEN n % 3 = 0 THEN 'google' ELSE 'local' END,
  CASE WHEN n <= 3 THEN md5('gov-id:' || n) ELSE NULL END,
  CASE WHEN n <= 5 THEN pg_temp.ts(n, 7) END,
  CASE WHEN n <= 5 THEN pg_temp.ts(n, 7) + interval '1 minute' END,
  'CL', 'Ciudad Sintetica', 'Region Sintetica',
  70 + n, pg_temp.ts(n, 7), pg_temp.ts(n, 7) + interval '1 day'
FROM generate_series(1, 7) n
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- AuditLog: 54 [M]; months 2026-06:1, 07:51, 08:1, 09:1 [M]; targetId is a
-- cuid in 54/54 rows [M]; metadata is text [M]. actorUserId mix [C].
-- Edge instants [T]: the last second of June, midnight of July 1st, 23:30 on
-- July 31st (a non-UTC session would push it into August), just after
-- midnight of August 1st.
-- ---------------------------------------------------------------------------
INSERT INTO "AuditLog" (id, "actorUserId", action, "targetType", "targetId", metadata, "createdAt")
SELECT pg_temp.cuid('audit:' || n),
  CASE WHEN n % 4 = 0 THEN NULL ELSE pg_temp.cuid('user:' || (1 + n % 7)) END,
  (ARRAY['REPORT_CREATED','HELP_REQUEST_CREATED','HELP_REQUEST_UNDER_REVIEW','USER_LOGIN','VESTA_PROFILE_UPDATED','RISK_ASSESSMENT_RUN'])[1 + n % 6],
  (ARRAY['Report','HelpRequest','User','PreparednessProfile','RiskAssessment'])[1 + n % 5],
  pg_temp.cuid('audit-target:' || n),
  CASE WHEN n % 5 = 0 THEN NULL ELSE '{"source":"synthetic","n":' || n || '}' END,
  CASE
    WHEN n = 1 THEN timestamp '2026-06-30 23:59:59.999'
    WHEN n = 2 THEN timestamp '2026-07-01 00:00:00'
    WHEN n = 3 THEN timestamp '2026-07-31 23:30:00'
    WHEN n = 53 THEN timestamp '2026-08-01 00:30:00'
    WHEN n = 54 THEN timestamp '2026-09-21 12:00:00'
    ELSE timestamp '2026-07-02 00:00:00' + (n * interval '13 hours')
  END
FROM generate_series(1, 54) n
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Report: 1 [M].
-- ---------------------------------------------------------------------------
INSERT INTO "Report" (id, "userId", category, title, description, latitude, longitude, "createdAt", "updatedAt")
VALUES (pg_temp.cuid('report:1'), pg_temp.cuid('user:2'), 'flood', 'Reporte sintetico', 'Descripcion sintetica', -33.45, -70.66,
  timestamp '2026-07-15 10:00:00', timestamp '2026-07-15 10:00:00')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- HelpRequest: production has 0 [M]; 25 here [T] so the Wave 050 backfill
-- really runs. Statuses are the ones the app writes [C]:
-- RECEIVED 8, UNDER_REVIEW 5, ASSIGNED 4, RESOLVED 6, CANCELLED 2.
-- ---------------------------------------------------------------------------
INSERT INTO "HelpRequest" (id, "userId", category, title, description, latitude, longitude, priority, status, "createdAt", "updatedAt")
SELECT pg_temp.cuid('help:' || n), pg_temp.cuid('user:' || (1 + n % 7)),
  (ARRAY['medical','rescue','shelter','supplies'])[1 + n % 4],
  'Solicitud sintetica ' || n, 'Descripcion sintetica', -33.4 - n * 0.01, -70.6 - n * 0.01,
  (ARRAY['LOW','MEDIUM','HIGH','CRITICAL'])[1 + n % 4],
  CASE WHEN n <= 8 THEN 'RECEIVED' WHEN n <= 13 THEN 'UNDER_REVIEW' WHEN n <= 17 THEN 'ASSIGNED'
       WHEN n <= 23 THEN 'RESOLVED' ELSE 'CANCELLED' END,
  pg_temp.ts(n, 25), pg_temp.ts(n, 25) + interval '2 hours'
FROM generate_series(1, 25) n
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- VESTA: PreparednessProfile 1 / FamilyPlan 1 / ChecklistItem 33 /
-- Reminder 7 in production [M]. Here 3 profiles and 3 family plans [T]: two
-- with meeting points, one with a (fictitious) medical note, so the
-- rehearsal can prove that no wave migrates or copies medical free text
-- (D-08) and that FamilyPlan survives untouched (no wave backfills it).
-- ---------------------------------------------------------------------------
INSERT INTO "PreparednessProfile" (id, "userId", "createdAt", "updatedAt")
SELECT pg_temp.cuid('profile:' || n), pg_temp.cuid('user:' || n), pg_temp.ts(n, 3), pg_temp.ts(n, 3)
FROM generate_series(1, 3) n
ON CONFLICT (id) DO NOTHING;

INSERT INTO "FamilyPlan" (id, "profileId", "primaryMeetingPoint", "alternateMeetingPoint", "medicalNeedsNotes", "createdAt", "updatedAt")
SELECT pg_temp.cuid('family:' || n), pg_temp.cuid('profile:' || n),
  CASE WHEN n <= 2 THEN 'Plaza sintetica ' || n END,
  CASE WHEN n = 1 THEN 'Parque sintetico' END,
  CASE WHEN n = 3 THEN 'SYNTHETIC-MEDICAL-NOTE-DO-NOT-MIGRATE' END,
  pg_temp.ts(n, 3), pg_temp.ts(n, 3)
FROM generate_series(1, 3) n
ON CONFLICT (id) DO NOTHING;

INSERT INTO "PreparednessChecklistItem" (id, "profileId", category, label, "createdAt", "updatedAt")
SELECT pg_temp.cuid('checklist:' || n), pg_temp.cuid('profile:' || (1 + n % 3)), 'water', 'Item ' || n, pg_temp.ts(n, 33), pg_temp.ts(n, 33)
FROM generate_series(1, 33) n
ON CONFLICT (id) DO NOTHING;

INSERT INTO "PreparednessReminder" (id, "profileId", type, title, "dueAt", "createdAt", "updatedAt")
SELECT pg_temp.cuid('reminder:' || n), pg_temp.cuid('profile:' || (1 + n % 3)), 'review', 'Recordatorio ' || n,
  timestamp '2026-10-01 00:00:00' + n * interval '1 day', pg_temp.ts(n, 7), pg_temp.ts(n, 7)
FROM generate_series(1, 7) n
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- KnowledgeSource: 1 row [M]. Which id it is was not measured; the rehearsal
-- must not depend on it (see the Wave 030 source consolidation).
-- ---------------------------------------------------------------------------
INSERT INTO "KnowledgeSource" (id, name, description, "domainsJson", "accessType", status, "licenseNotes", "reliabilityScore", enabled, "createdAt", "updatedAt")
VALUES ('usgs_earthquake', 'USGS Earthquake', 'Synthetic', '["earthquake"]', 'api', 'active', 'public domain', 95, true,
  timestamp '2026-06-20 00:00:00', timestamp '2026-06-20 00:00:00')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- IngestionRun: 3653 [M]. sourceId = Global Watch registry ids; status in
-- {success, error, failed} [C] (recordIngestionRun callers).
-- ---------------------------------------------------------------------------
INSERT INTO "IngestionRun" (id, "sourceId", status, "fetchedAt", "completedAt", count, "durationMs")
SELECT pg_temp.cuid('ingest-run:' || n),
  (ARRAY['gdacs','nasa_firms','usgs_earthquake','noaa_tsunami','met_norway','codigo_azul'])[1 + n % 6],
  CASE WHEN n % 20 = 0 THEN 'failed' WHEN n % 5 = 0 THEN 'error' ELSE 'success' END,
  pg_temp.ts(n, 3653), pg_temp.ts(n, 3653) + interval '3 seconds', n % 50, 1000 + n % 900
FROM generate_series(1, 3653) n
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- KnowledgeIngestionRun: 9577 [M]. status in {success, partial, failed,
-- error} [C] (knowledge-intake jobs); sourceIds shared by both registries [C].
-- ---------------------------------------------------------------------------
INSERT INTO "KnowledgeIngestionRun" (id, "sourceId", "sourceName", status, "startedAt", "finishedAt")
SELECT pg_temp.cuid('kir:' || n),
  (ARRAY['usgs_earthquake','gdacs','nasa_firms','nasa-eonet','reliefweb','copernicus_effis','open-meteo'])[1 + n % 7],
  'Synthetic source',
  CASE WHEN n % 17 = 0 THEN 'error' WHEN n % 11 = 0 THEN 'failed' WHEN n % 4 = 0 THEN 'partial' ELSE 'success' END,
  pg_temp.ts(n, 9577), pg_temp.ts(n, 9577) + interval '20 seconds'
FROM generate_series(1, 9577) n
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- ExternalEvent: 1961 = gdacs 862 + nasa_firms 660 + usgs_earthquake 422 +
-- noaa_tsunami 17 [M].
-- ---------------------------------------------------------------------------
INSERT INTO "ExternalEvent" (id, "sourceId", "externalId", category, title, description, severity, latitude, longitude,
  "occurredAt", "fetchedAt", raw, "createdAt", "updatedAt")
SELECT pg_temp.cuid('ee:' || n),
  CASE WHEN n <= 862 THEN 'gdacs' WHEN n <= 1522 THEN 'nasa_firms' WHEN n <= 1944 THEN 'usgs_earthquake' ELSE 'noaa_tsunami' END,
  'ext-' || n,
  CASE WHEN n <= 862 THEN 'multi_hazard' WHEN n <= 1522 THEN 'wildfire' WHEN n <= 1944 THEN 'earthquake' ELSE 'tsunami' END,
  'Evento sintetico ' || n, 'Descripcion sintetica', 'MEDIUM', -30 - (n % 20), -71 + (n % 5) * 0.1,
  CASE WHEN n = 1 THEN timestamp '2026-07-31 23:30:00' ELSE pg_temp.ts(n, 1961) END,
  CASE WHEN n = 1 THEN timestamp '2026-07-31 23:35:00' ELSE pg_temp.ts(n, 1961) + interval '5 minutes' END,
  jsonb_build_object('synthetic', true, 'n', n),
  pg_temp.ts(n, 1961) + interval '5 minutes', pg_temp.ts(n, 1961) + interval '5 minutes'
FROM generate_series(1, 1961) n
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- KnowledgeIncident: 8207 [M].
--   verificationStatus: CANDIDATE 4737, OFFICIAL 3457, UNVERIFIED 13 [M]
--   reviewStatus: pending_review 4737, auto_accepted 3457, needs_more_evidence 13 [M]
--   status: NULL 6992, monitoring 903, resolved 179, active 118, archived 11, new 4 [M]
--   domain: wildfire 6737, earthquake 1126, thunderstorm 87, flood 79,
--           weather_alert 69, severe_wind 44, storm 31, landslide 18,
--           hurricane 12, volcano 3, tornado 1 [M]
-- status/domain are spread with coprime permutations so that every
-- combination with verificationStatus occurs; the joint distribution was not
-- measured.
-- ---------------------------------------------------------------------------
INSERT INTO "KnowledgeIncident" (id, "sourceId", "sourceName", title, summary, domain, severity,
  "confidenceScore", "actionabilityScore", "sourceReliabilityScore",
  "verificationStatus", "reviewStatus", status, "canonicalKey", "createdAt", "updatedAt")
SELECT pg_temp.cuid('ki:' || n), src, 'Synthetic source', 'Incidente sintetico ' || n, 'Resumen sintetico', dom, 'MEDIUM',
  50 + n % 50, 40 + n % 60, 60 + n % 40,
  CASE WHEN n <= 4737 THEN 'CANDIDATE' WHEN n <= 8194 THEN 'OFFICIAL' ELSE 'UNVERIFIED' END,
  CASE WHEN n <= 4737 THEN 'pending_review' WHEN n <= 8194 THEN 'auto_accepted' ELSE 'needs_more_evidence' END,
  CASE WHEN rs < 6992 THEN NULL WHEN rs < 7895 THEN 'monitoring' WHEN rs < 8074 THEN 'resolved'
       WHEN rs < 8192 THEN 'active' WHEN rs < 8203 THEN 'archived' ELSE 'new' END,
  src || ':key-' || n,
  CASE WHEN n = 1 THEN timestamp '2026-07-31 23:30:00' WHEN n = 4738 THEN timestamp '2026-08-31 22:15:00'
       ELSE pg_temp.ts(n, 8207) END,
  pg_temp.ts(n, 8207)
FROM (
  SELECT n, (n * 7919) % 8207 AS rs,
    CASE WHEN rd < 6737 THEN 'wildfire' WHEN rd < 7863 THEN 'earthquake' WHEN rd < 7950 THEN 'thunderstorm'
         WHEN rd < 8029 THEN 'flood' WHEN rd < 8098 THEN 'weather_alert' WHEN rd < 8142 THEN 'severe_wind'
         WHEN rd < 8173 THEN 'storm' WHEN rd < 8191 THEN 'landslide' WHEN rd < 8203 THEN 'hurricane'
         WHEN rd < 8206 THEN 'volcano' ELSE 'tornado' END AS dom,
    CASE WHEN rd < 6737 THEN 'nasa_firms' WHEN rd < 7863 THEN 'usgs_earthquake' ELSE 'gdacs' END AS src
  FROM (SELECT n, (n * 6421) % 8207 AS rd FROM generate_series(1, 8207) n) p
) q
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- KnowledgeEvidence: 11063 [M]; linked to incidents of every verification
-- status [T]; the last 1063 have no incident [C: incidentId is nullable].
-- ---------------------------------------------------------------------------
INSERT INTO "KnowledgeEvidence" (id, "incidentId", "sourceId", "sourceName", "evidenceType", title, "confidenceScore", "createdAt")
SELECT pg_temp.cuid('ke:' || n),
  CASE WHEN n <= 10000 THEN pg_temp.cuid('ki:' || (1 + (n * 13) % 8207)) END,
  (ARRAY['nasa_firms','usgs_earthquake','gdacs'])[1 + n % 3], 'Synthetic source', 'observation', 'Evidencia sintetica ' || n,
  50 + n % 50, pg_temp.ts(n, 11063)
FROM generate_series(1, 11063) n
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- IncidentTransition: 81; newStatus NULL 59, monitoring 11, resolved 11 [M].
-- Parents: the first 30 point at CANDIDATE incidents, the rest at OFFICIAL
-- ones [T]. previousSeverity/newSeverity always set [C: the writer sets both];
-- a NULL newStatus is therefore a severity-only change. A candidate's history
-- must not vanish when its parent is routed
-- to incident_candidates instead of incidents.
-- ---------------------------------------------------------------------------
INSERT INTO "IncidentTransition" (id, "incidentId", "previousStatus", "newStatus", "previousSeverity", "newSeverity", reason, "createdAt")
SELECT pg_temp.cuid('it:' || n),
  CASE WHEN n <= 30 THEN pg_temp.cuid('ki:' || n) ELSE pg_temp.cuid('ki:' || (4800 + n)) END,
  CASE WHEN n % 3 = 0 THEN 'monitoring' ELSE NULL END,
  CASE WHEN n <= 59 THEN NULL WHEN n <= 70 THEN 'monitoring' ELSE 'resolved' END,
  'MEDIUM', CASE WHEN n % 2 = 0 THEN 'HIGH' ELSE 'MEDIUM' END,
  'Transicion sintetica', pg_temp.ts(n, 81)
FROM generate_series(1, 81) n
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- RiskAssessment 45: fire_smoke 22, earthquake_impact 18, tsunami 3,
-- humanitarian_impact 2 [M]. RiskAssessmentRevision 50 [M].
-- ---------------------------------------------------------------------------
INSERT INTO "RiskAssessment" (id, "riskType", status, "probabilityBand", severity, title, summary, "recommendedAction",
  "probabilityScore", confidence, "relatedExternalEventIds", evidence, "createdAt", "updatedAt")
SELECT pg_temp.cuid('ra:' || n),
  CASE WHEN n <= 22 THEN 'fire_smoke' WHEN n <= 40 THEN 'earthquake_impact' WHEN n <= 43 THEN 'tsunami' ELSE 'humanitarian_impact' END,
  CASE WHEN n % 4 = 0 THEN 'expired' ELSE 'active' END,
  'MEDIUM', 'MEDIUM', 'Evaluacion sintetica ' || n, 'Resumen', 'Accion', 40 + n, 60,
  '[]'::jsonb, '[]'::jsonb, pg_temp.ts(n, 45), pg_temp.ts(n, 45)
FROM generate_series(1, 45) n
ON CONFLICT (id) DO NOTHING;

INSERT INTO "RiskAssessmentRevision" (id, "assessmentId", "previousStatus", "newStatus", "newProbabilityScore", reason, "createdAt")
SELECT pg_temp.cuid('rar:' || n), pg_temp.cuid('ra:' || (1 + n % 45)), 'active', 'active', 50, 'Revision sintetica', pg_temp.ts(n, 50)
FROM generate_series(1, 50) n
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- HazardKnowledgeDocument 59 [M]; ingestionStatus values from code [C].
-- HazardKnowledgeFact 41 with the exact 33 hazardType values [M].
-- ---------------------------------------------------------------------------
INSERT INTO "HazardKnowledgeDocument" (id, title, "sourceName", "sourceUrl", "hazardType", "ingestionStatus", "createdAt", "updatedAt")
SELECT pg_temp.cuid('hkd:' || n), 'Documento sintetico ' || n, 'Synthetic', 'https://example.invalid/doc/' || n,
  (ARRAY['tsunami','terremoto','erupcion volcanica','incendio forestal'])[1 + n % 4],
  (ARRAY['queued','partially_extracted','seeded'])[1 + n % 3],
  pg_temp.ts(n, 59), pg_temp.ts(n, 59)
FROM generate_series(1, 59) n
ON CONFLICT (id) DO NOTHING;

WITH vocab(hazard, cnt) AS (VALUES
  ('tsunami',9),
  ('tormentas de polvo o arena',1),
  ('frio extremo y tormentas invernales',1),
  ('tornado',1),
  ('flujo piroclastico',1),
  ('deslizamientos y aluviones',1),
  ('earthquake',1),
  ('tormenta electrica y rayos',1),
  ('ceniza volcanica',1),
  ('humanitarian',1),
  ('eventos radiologicos',1),
  ('lahar',1),
  ('marejada ciclonica',1),
  ('accidente quimico industrial',1),
  ('incendio urbano-forestal',1),
  ('brotes biologicos o zoonoticos',1),
  ('sequias',1),
  ('terremoto',1),
  ('terremoto con riesgo de tsunami',1),
  ('avalanchas',1),
  ('meteoritos o impactos atmosfericos',1),
  ('inundacion / crecida subita',1),
  ('explosiones industriales de gran escala',1),
  ('crecida subita',1),
  ('incendio forestal / urbano-forestal',1),
  ('licuefaccion del suelo',1),
  ('granizo severo',1),
  ('replicas sismicas',1),
  ('huracan, ciclon o tifon',1),
  ('accidente nuclear civil',1),
  ('ola de calor',1),
  ('accidente quimico, nuclear, radiologico o explosion industrial',1),
  ('erupcion volcanica',1)
), expanded AS (
  SELECT hazard, row_number() OVER (ORDER BY hazard, g) AS n
  FROM vocab, generate_series(1, cnt) g
)
INSERT INTO "HazardKnowledgeFact" (id, "documentId", "hazardType", "knowledgeType", title, summary, "sourceName", "sourceUrl",
  confidence, "extractionStatus", "createdAt", "updatedAt")
SELECT pg_temp.cuid('hkf:' || n), CASE WHEN n % 10 = 0 THEN NULL ELSE pg_temp.cuid('hkd:' || (1 + n % 59)) END,
  hazard, 'historical_event', 'Hecho sintetico ' || n, 'Resumen sintetico', 'Synthetic', 'https://example.invalid/fact/' || n,
  70, 'extracted', pg_temp.ts(n::int, 41), pg_temp.ts(n::int, 41)
FROM expanded
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- CriticalPoi 530 [M]: school 212, metro_station 110, shelter 108,
-- pharmacy 58, hospital 15, police_station 12, fire_station 10,
-- train_station 2, clinic 1, courthouse 1, municipal_office 1.
-- source: official_open_data 108 (the shelters), osm 422 [M].
-- status 'active' [C: the only value the writers set].
-- CriticalPoiOperationalStatus 108 and CriticalPoiStatusEvidence 108 [M],
-- both for the shelters [C: Codigo Azul sync].
-- ---------------------------------------------------------------------------
INSERT INTO "CriticalPoi" (id, "externalId", source, name, category, priority, latitude, longitude, status, "createdAt", "updatedAt")
SELECT pg_temp.cuid('poi:' || n), 'ext-poi-' || n,
  CASE WHEN cat = 'shelter' THEN 'official_open_data' ELSE 'osm' END,
  'POI sintetico ' || n, cat,
  CASE WHEN cat IN ('hospital','shelter','fire_station') THEN 'critical' WHEN cat IN ('clinic','police_station','pharmacy') THEN 'high' ELSE 'medium' END,
  -33 - (n % 100) * 0.01, -70.5 - (n % 50) * 0.01, 'active', pg_temp.ts(n, 530), pg_temp.ts(n, 530)
FROM (
  SELECT n, CASE WHEN n <= 212 THEN 'school' WHEN n <= 322 THEN 'metro_station' WHEN n <= 430 THEN 'shelter'
    WHEN n <= 488 THEN 'pharmacy' WHEN n <= 503 THEN 'hospital' WHEN n <= 515 THEN 'police_station'
    WHEN n <= 525 THEN 'fire_station' WHEN n <= 527 THEN 'train_station' WHEN n = 528 THEN 'clinic'
    WHEN n = 529 THEN 'courthouse' ELSE 'municipal_office' END AS cat
  FROM generate_series(1, 530) n
) q
ON CONFLICT (id) DO NOTHING;

INSERT INTO "CriticalPoiOperationalStatus" (id, "poiId", "sourceType", "sourceName", "lastUpdatedAt", "capacityTotal", "occupancyCurrent", "createdAt")
SELECT pg_temp.cuid('cpos:' || n), pg_temp.cuid('poi:' || (322 + n)), 'official', 'Codigo Azul (synthetic)',
  pg_temp.ts(n, 108), 50 + n, n % 40, pg_temp.ts(n, 108)
FROM generate_series(1, 108) n
ON CONFLICT (id) DO NOTHING;

INSERT INTO "CriticalPoiStatusEvidence" (id, "poiId", "eventType", "sourceType", "sourceName", "confidenceScore", "createdAt")
SELECT pg_temp.cuid('cpse:' || n), pg_temp.cuid('poi:' || (322 + n)), 'status_update', 'official', 'Codigo Azul (synthetic)', 80, pg_temp.ts(n, 108)
FROM generate_series(1, 108) n
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Blocking self-check: exact volumes, and the production shapes that the
-- former fixture did not have.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  bad text := '';
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('User', (SELECT count(*) FROM "User"), 7),
      ('AuditLog', (SELECT count(*) FROM "AuditLog"), 54),
      ('Report', (SELECT count(*) FROM "Report"), 1),
      ('HelpRequest', (SELECT count(*) FROM "HelpRequest"), 25),
      ('PreparednessProfile', (SELECT count(*) FROM "PreparednessProfile"), 3),
      ('FamilyPlan', (SELECT count(*) FROM "FamilyPlan"), 3),
      ('PreparednessChecklistItem', (SELECT count(*) FROM "PreparednessChecklistItem"), 33),
      ('PreparednessReminder', (SELECT count(*) FROM "PreparednessReminder"), 7),
      ('KnowledgeSource', (SELECT count(*) FROM "KnowledgeSource"), 1),
      ('IngestionRun', (SELECT count(*) FROM "IngestionRun"), 3653),
      ('KnowledgeIngestionRun', (SELECT count(*) FROM "KnowledgeIngestionRun"), 9577),
      ('ExternalEvent', (SELECT count(*) FROM "ExternalEvent"), 1961),
      ('KnowledgeIncident', (SELECT count(*) FROM "KnowledgeIncident"), 8207),
      ('KnowledgeEvidence', (SELECT count(*) FROM "KnowledgeEvidence"), 11063),
      ('IncidentTransition', (SELECT count(*) FROM "IncidentTransition"), 81),
      ('RiskAssessment', (SELECT count(*) FROM "RiskAssessment"), 45),
      ('RiskAssessmentRevision', (SELECT count(*) FROM "RiskAssessmentRevision"), 50),
      ('HazardKnowledgeDocument', (SELECT count(*) FROM "HazardKnowledgeDocument"), 59),
      ('HazardKnowledgeFact', (SELECT count(*) FROM "HazardKnowledgeFact"), 41),
      ('CriticalPoi', (SELECT count(*) FROM "CriticalPoi"), 530),
      ('CriticalPoiOperationalStatus', (SELECT count(*) FROM "CriticalPoiOperationalStatus"), 108),
      ('CriticalPoiStatusEvidence', (SELECT count(*) FROM "CriticalPoiStatusEvidence"), 108)
    ) v(tbl, actual, expected)
  LOOP
    IF r.actual <> r.expected THEN bad := bad || format(' %s=%s(expected %s)', r.tbl, r.actual, r.expected); END IF;
  END LOOP;
  IF (SELECT count(*) FROM "KnowledgeIncident" WHERE "verificationStatus" IN ('CANDIDATE','UNVERIFIED')) <> 4750 THEN bad := bad || ' KI_candidates<>4750'; END IF;
  IF (SELECT count(*) FROM "KnowledgeIncident" WHERE status IS NULL) <> 6992 THEN bad := bad || ' KI_status_null<>6992'; END IF;
  IF EXISTS (SELECT 1 FROM "AuditLog" WHERE "targetId" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-') THEN bad := bad || ' AuditLog_targetId_uuid'; END IF;
  IF (SELECT count(DISTINCT "hazardType") FROM "HazardKnowledgeFact") <> 33 THEN bad := bad || ' hazard_vocab<>33'; END IF;
  IF (SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'AuditLog' AND column_name = 'createdAt') <> 'timestamp without time zone' THEN
    bad := bad || ' AuditLog.createdAt_not_timestamp';
  END IF;
  IF bad <> '' THEN RAISE EXCEPTION 'LEGACY_BASELINE_DATA_FAIL:%', bad; END IF;
  RAISE NOTICE 'LEGACY_BASELINE_DATA_PASS';
END $$;
