-- NOT EXECUTED IN THIS SESSION UNTIL THE FIRST REAL LOCAL REHEARSAL RUN
-- Synthetic LEGACY-SCHEMA fixtures for the ARGUS full local migration
-- rehearsal.
--
-- Runs BEFORE Wave 000 (i.e. against a genuinely empty database, right
-- after Reset-ArgusRehearsal.ps1). The rehearsal container never runs
-- prisma/schema.prisma (only prisma/target-migrations/*/migration.sql), so
-- without this file every "real backfill" SELECT ... FROM "<LegacyTable>"
-- in prisma/target-migrations/*/backfill.sql (waves 010, 020, 030, 040,
-- 050, 060, 080, 100) fails with "relation does not exist" the moment it
-- runs. This file creates minimal, synthetic stand-ins for the current
-- `public` schema tables (per prisma/schema.prisma, READ-ONLY reference for
-- column names/types here - this file never touches that file or
-- prisma/migrations/) so those backfills execute for real against
-- structurally faithful, entirely fictitious data.
--
-- Every value below is fictitious: no real names, emails, national IDs,
-- phone numbers, or coordinates of real people, incidents, or facilities.
--
-- Idempotent: fixed ids + `ON CONFLICT (id) DO NOTHING` (or `WHERE NOT
-- EXISTS` for tables with no natural single-column PK conflict target used
-- here), safe to run once per fresh volume (called once per
-- Reset-ArgusRehearsal.ps1 in Invoke-ArgusFullRehearsal.ps1 - first
-- install, and again after Fase 15's from-scratch reinstall).
--
-- Tables intentionally left EMPTY (created, zero rows) because that matches
-- documented production reality and each wave's backfill.sql explicitly
-- expects 0 source rows for them: "HelpRequest" (0, Fase/D-04 precedent),
-- "KnowledgeLesson" (0), "KnowledgeDocument" (0, dedup-guard branch only).
--
-- All "id" values here are valid UUID-format text (the legacy schema's ids
-- are plain `text`/cuid-shaped in production, but several backfill.sql
-- statements CAST legacy id columns to ::uuid, e.g.
-- prisma/target-migrations/010_foundation/backfill.sql's
-- `actorUserId ... ::uuid` - using UUID-shaped text here keeps every such
-- cast valid without altering any backfill SQL).

BEGIN;

-- =============================================================================
-- 1. "User" (7 rows - matches Wave 020's "expect 7" checkpoint exactly)
-- =============================================================================
CREATE TABLE IF NOT EXISTS "User" (
  id                  text PRIMARY KEY,
  name                text NOT NULL,
  email               text NOT NULL UNIQUE,
  phone               text NULL,
  "governmentIdHash"  text NULL UNIQUE,
  "passwordHash"      text NULL,
  "countryCode"       text NULL,
  city                text NULL,
  region              text NULL,
  "authProvider"      text NULL DEFAULT 'local',
  "lastLoginAt"       timestamptz NULL,
  "publicAlias"       text NOT NULL,
  role                text NOT NULL DEFAULT 'CITIZEN',
  "accountStatus"     text NOT NULL DEFAULT 'ACTIVE',
  "trustScore"        integer NOT NULL DEFAULT 70,
  strikes             integer NOT NULL DEFAULT 0,
  "termsAcceptedAt"   timestamptz NULL,
  "privacyAcceptedAt" timestamptz NULL,
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedAt"         timestamptz NOT NULL DEFAULT now()
);

INSERT INTO "User" (id, name, email, phone, "governmentIdHash", "countryCode", city, region,
  "authProvider", "lastLoginAt", "publicAlias", role, "accountStatus", "trustScore", strikes,
  "termsAcceptedAt", "privacyAcceptedAt", "createdAt", "updatedAt")
VALUES
  ('91000000-0000-0000-0000-000000000001', 'Persona Sintética Uno', 'ensayo.uno@example.invalid', '+56900000001', 'synthetic-gov-hash-001', 'CL', 'Santiago', 'Metropolitana',
   'local', '2026-06-01 09:00:00+00', 'usuario.uno', 'CITIZEN', 'ACTIVE', 78, 0,
   '2026-01-01 00:00:00+00', '2026-01-01 00:00:00+00', '2026-01-01 00:00:00+00', '2026-06-01 09:00:00+00'),
  ('91000000-0000-0000-0000-000000000002', 'Persona Sintética Dos', 'ensayo.dos@example.invalid', NULL, NULL, 'CL', 'Valparaíso', 'Valparaíso',
   'local', NULL, 'usuario.dos', 'CITIZEN', 'SUSPENDED', 55, 2,
   NULL, NULL, '2026-01-05 00:00:00+00', '2026-01-05 00:00:00+00'),
  ('91000000-0000-0000-0000-000000000003', 'Persona Sintética Tres', 'ensayo.tres@example.invalid', '+56900000003', 'synthetic-gov-hash-003', 'CL', 'Concepción', 'Biobío',
   'google', '2026-05-20 12:00:00+00', 'usuario.tres', 'OPERATOR', 'ACTIVE', 82, 0,
   '2026-01-10 00:00:00+00', '2026-01-10 00:00:00+00', '2026-01-10 00:00:00+00', '2026-05-20 12:00:00+00'),
  ('91000000-0000-0000-0000-000000000004', 'Persona Sintética Cuatro', 'ensayo.cuatro@example.invalid', NULL, NULL, 'CL', 'Antofagasta', 'Antofagasta',
   'local', NULL, 'usuario.cuatro', 'CITIZEN', 'ACTIVE', 70, 0,
   NULL, NULL, '2026-02-01 00:00:00+00', '2026-02-01 00:00:00+00'),
  ('91000000-0000-0000-0000-000000000005', 'Persona Sintética Cinco', 'ensayo.cinco@example.invalid', '+56900000005', 'synthetic-gov-hash-005', 'CL', 'La Serena', 'Coquimbo',
   'local', '2026-04-15 08:30:00+00', 'usuario.cinco', 'CITIZEN', 'ACTIVE', 65, 1,
   '2026-02-15 00:00:00+00', NULL, '2026-02-15 00:00:00+00', '2026-04-15 08:30:00+00'),
  ('91000000-0000-0000-0000-000000000006', 'Persona Sintética Seis', 'ensayo.seis@example.invalid', NULL, NULL, 'CL', 'Temuco', 'Araucanía',
   'local', NULL, 'usuario.seis', 'CITIZEN', 'ACTIVE', 70, 0,
   NULL, '2026-03-01 00:00:00+00', '2026-03-01 00:00:00+00', '2026-03-01 00:00:00+00'),
  ('91000000-0000-0000-0000-000000000007', 'Persona Sintética Siete', 'ensayo.siete@example.invalid', '+56900000007', NULL, 'CL', 'Puerto Montt', 'Los Lagos',
   'local', '2026-06-10 07:00:00+00', 'usuario.siete', 'CITIZEN', 'ACTIVE', 90, 0,
   '2026-03-10 00:00:00+00', '2026-03-10 00:00:00+00', '2026-03-10 00:00:00+00', '2026-06-10 07:00:00+00')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 2. "AuditLog" (2 rows - Wave 010, real backfill into security.audit_logs)
-- =============================================================================
CREATE TABLE IF NOT EXISTS "AuditLog" (
  id            text PRIMARY KEY,
  "actorUserId" text NULL,
  action        text NOT NULL,
  "targetType"  text NOT NULL,
  "targetId"    text NULL,
  metadata      text NULL,
  "createdAt"   timestamptz NOT NULL DEFAULT now()
);

-- createdAt values MUST fall inside security.audit_logs_y2026m07, the only
-- partition security.audit_logs has (migration.sql:422-424, FOR VALUES FROM
-- '2026-07-01' TO '2026-08-01') - Wave 010's backfill writes createdAt
-- straight through as occurred_at, the partition key.
INSERT INTO "AuditLog" (id, "actorUserId", action, "targetType", "targetId", metadata, "createdAt")
VALUES
  ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'CREATE_REPORT', 'Report', '97000000-0000-0000-0000-000000000001', '{"note":"synthetic fixture"}', '2026-07-01 10:00:00+00'),
  ('92000000-0000-0000-0000-000000000002', NULL, 'LOGIN', 'Session', NULL, NULL, '2026-07-02 11:00:00+00')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 3. "KnowledgeSource" (1 row - Wave 030, FUSIONAR with the code catalog)
-- =============================================================================
CREATE TABLE IF NOT EXISTS "KnowledgeSource" (
  id                 text PRIMARY KEY,
  name               text NOT NULL,
  description        text NOT NULL,
  "domainsJson"      jsonb NOT NULL,
  "accessType"       text NOT NULL,
  status             text NOT NULL,
  "licenseNotes"     text NOT NULL,
  "reliabilityScore" integer NOT NULL,
  "officialSource"   boolean NOT NULL DEFAULT false,
  enabled            boolean NOT NULL DEFAULT true,
  "createdAt"        timestamptz NOT NULL DEFAULT now(),
  "updatedAt"        timestamptz NOT NULL DEFAULT now()
);

INSERT INTO "KnowledgeSource" (id, name, description, "domainsJson", "accessType", status, "licenseNotes",
  "reliabilityScore", "officialSource", enabled, "createdAt", "updatedAt")
VALUES
  ('knowledge-source-synthetic-01', 'Fuente Sintética de Ensayo', 'Fuente de conocimiento sintética, solo para el ensayo local', '["hazard"]'::jsonb,
   'PUBLIC', 'active', 'CC-BY sintético', 80, false, true, '2026-01-01 00:00:00+00', '2026-01-01 00:00:00+00')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 4. "IngestionRun" (1 row - Wave 030, FUSIONAR with KnowledgeIngestionRun)
-- =============================================================================
CREATE TABLE IF NOT EXISTS "IngestionRun" (
  id            text PRIMARY KEY,
  "sourceId"    text NOT NULL,
  status        text NOT NULL,
  "fetchedAt"   timestamptz NOT NULL DEFAULT now(),
  "completedAt" timestamptz NULL,
  count         integer NULL,
  cached        boolean NOT NULL DEFAULT false
);

INSERT INTO "IngestionRun" (id, "sourceId", status, "fetchedAt", "completedAt", count, cached)
VALUES
  ('94000000-0000-0000-0000-000000000001', 'knowledge-source-synthetic-01', 'success', '2026-05-01 06:00:00+00', '2026-05-01 06:05:00+00', 12, false)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 5. "KnowledgeIngestionRun" (1 row)
-- =============================================================================
CREATE TABLE IF NOT EXISTS "KnowledgeIngestionRun" (
  id                  text PRIMARY KEY,
  "sourceId"          text NOT NULL,
  "sourceName"        text NOT NULL,
  status              text NOT NULL,
  "startedAt"         timestamptz NOT NULL DEFAULT now(),
  "finishedAt"        timestamptz NULL,
  "recordsFetched"    integer NOT NULL DEFAULT 0,
  "recordsNormalized" integer NOT NULL DEFAULT 0,
  "recordsInserted"   integer NOT NULL DEFAULT 0,
  "recordsUpdated"    integer NOT NULL DEFAULT 0,
  "recordsSkipped"    integer NOT NULL DEFAULT 0
);

INSERT INTO "KnowledgeIngestionRun" (id, "sourceId", "sourceName", status, "startedAt", "finishedAt",
  "recordsFetched", "recordsNormalized", "recordsInserted", "recordsUpdated", "recordsSkipped")
VALUES
  ('95000000-0000-0000-0000-000000000001', 'knowledge-source-synthetic-01', 'Fuente Sintética de Ensayo', 'completed', '2026-05-02 06:00:00+00', '2026-05-02 06:10:00+00', 5, 5, 5, 0, 0)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 6. "ExternalEvent" (2 rows - Wave 030, T-01)
-- =============================================================================
CREATE TABLE IF NOT EXISTS "ExternalEvent" (
  id             text PRIMARY KEY,
  "sourceId"     text NOT NULL,
  "externalId"   text NOT NULL,
  category       text NOT NULL,
  title          text NOT NULL,
  description    text NULL,
  severity       text NULL,
  confidence     integer NULL,
  latitude       double precision NULL,
  longitude      double precision NULL,
  "locationName" text NULL,
  country        text NULL,
  "occurredAt"   timestamptz NULL,
  "fetchedAt"    timestamptz NULL,
  raw            jsonb NULL,
  "createdAt"    timestamptz NOT NULL DEFAULT now(),
  "updatedAt"    timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("sourceId", "externalId")
);

INSERT INTO "ExternalEvent" (id, "sourceId", "externalId", category, title, description, severity, confidence,
  latitude, longitude, "locationName", country, "occurredAt", "fetchedAt", raw, "createdAt", "updatedAt")
VALUES
  ('96000000-0000-0000-0000-000000000001', 'knowledge-source-synthetic-01', 'ext-evt-001', 'INCENDIO', 'Evento sintético 1', 'Descripción sintética 1', 'HIGH', 80,
   -33.45, -70.66, 'Santiago (sintético)', 'CL', '2026-05-03 10:00:00+00', '2026-05-03 10:05:00+00', '{}'::jsonb, '2026-05-03 10:05:00+00', '2026-05-03 10:05:00+00'),
  ('96000000-0000-0000-0000-000000000002', 'knowledge-source-synthetic-01', 'ext-evt-002', 'INUNDACION', 'Evento sintético 2', 'Descripción sintética 2', 'MEDIUM', 60,
   -36.82, -73.05, 'Concepción (sintético)', 'CL', '2026-05-04 09:00:00+00', '2026-05-04 09:05:00+00', '{}'::jsonb, '2026-05-04 09:05:00+00', '2026-05-04 09:05:00+00')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 7. "Report" (1 row)
-- =============================================================================
CREATE TABLE IF NOT EXISTS "Report" (
  id           text PRIMARY KEY,
  "userId"     text NOT NULL,
  category     text NOT NULL,
  title        text NOT NULL,
  description  text NOT NULL,
  latitude     double precision NOT NULL,
  longitude    double precision NOT NULL,
  severity     text NOT NULL DEFAULT 'LOW',
  status       text NOT NULL DEFAULT 'NEW',
  "createdAt"  timestamptz NOT NULL DEFAULT now(),
  "updatedAt"  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO "Report" (id, "userId", category, title, description, latitude, longitude, severity, status, "createdAt", "updatedAt")
VALUES
  ('97000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'INCENDIO', 'Reporte sintético', 'Descripción sintética de ensayo', -33.45, -70.66, 'LOW', 'NEW', '2026-04-01 09:55:00+00', '2026-04-01 09:55:00+00')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 8. "KnowledgeEvidence" (1 row)
-- =============================================================================
CREATE TABLE IF NOT EXISTS "KnowledgeEvidence" (
  id                text PRIMARY KEY,
  "incidentId"      text NULL,
  "sourceId"        text NOT NULL,
  "sourceName"      text NOT NULL,
  "evidenceType"    text NOT NULL,
  title             text NOT NULL,
  "confidenceScore" integer NOT NULL,
  "createdAt"       timestamptz NOT NULL DEFAULT now()
);

INSERT INTO "KnowledgeEvidence" (id, "sourceId", "sourceName", "evidenceType", title, "confidenceScore", "createdAt")
VALUES
  ('98000000-0000-0000-0000-000000000001', 'knowledge-source-synthetic-01', 'Fuente Sintética de Ensayo', 'DOCUMENT', 'Evidencia sintética', 70, '2026-05-05 00:00:00+00')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 9. "KnowledgeIncident" (2 rows - one candidate, one confirmed incident)
-- =============================================================================
CREATE TABLE IF NOT EXISTS "KnowledgeIncident" (
  id                       text PRIMARY KEY,
  "sourceId"               text NOT NULL,
  "sourceName"             text NOT NULL,
  title                    text NOT NULL,
  summary                  text NOT NULL,
  domain                   text NOT NULL,
  severity                 text NOT NULL,
  "confidenceScore"        integer NOT NULL,
  "actionabilityScore"     integer NOT NULL,
  "sourceReliabilityScore" integer NOT NULL,
  "verificationStatus"     text NULL,
  status                   text NULL,
  "canonicalKey"           text NULL,
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedAt"              timestamptz NOT NULL DEFAULT now()
);

INSERT INTO "KnowledgeIncident" (id, "sourceId", "sourceName", title, summary, domain, severity,
  "confidenceScore", "actionabilityScore", "sourceReliabilityScore", "verificationStatus", status, "canonicalKey", "createdAt", "updatedAt")
VALUES
  ('99000000-0000-0000-0000-000000000001', 'knowledge-source-synthetic-01', 'Fuente Sintética de Ensayo', 'Incidente sintético candidato', 'Resumen sintético candidato', 'INCENDIO', 'HIGH',
   80, 70, 80, 'unverified', 'detected', 'synthetic-key-01', '2026-05-06 00:00:00+00', '2026-05-06 00:00:00+00'),
  ('99000000-0000-0000-0000-000000000002', 'knowledge-source-synthetic-01', 'Fuente Sintética de Ensayo', 'Incidente sintético confirmado', 'Resumen sintético confirmado', 'INUNDACION', 'MEDIUM',
   85, 75, 80, 'confirmed', 'active', 'synthetic-key-02', '2026-05-07 00:00:00+00', '2026-05-07 00:00:00+00')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 10. "IncidentTransition" (1 row - incidentId points at the confirmed
--     KnowledgeIncident, since only non-candidate rows land in
--     incident.incidents, which Wave 040's transition INSERT joins against)
-- =============================================================================
CREATE TABLE IF NOT EXISTS "IncidentTransition" (
  id                 text PRIMARY KEY,
  "incidentId"       text NOT NULL,
  "previousStatus"   text NULL,
  "newStatus"        text NULL,
  reason             text NOT NULL,
  "createdAt"        timestamptz NOT NULL DEFAULT now()
);

INSERT INTO "IncidentTransition" (id, "incidentId", "previousStatus", "newStatus", reason, "createdAt")
VALUES
  ('9a000000-0000-0000-0000-000000000001', '99000000-0000-0000-0000-000000000002', 'detected', 'active', 'Transición sintética de ensayo', '2026-05-07 01:00:00+00')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 11. "RiskAssessment" (1 row - riskType='INCENDIO' matches the
--     governance.hazard_types seed from Wave 010's own backfill.sql)
-- =============================================================================
CREATE TABLE IF NOT EXISTS "RiskAssessment" (
  id                        text PRIMARY KEY,
  "riskType"                text NOT NULL,
  status                    text NOT NULL,
  "probabilityBand"         text NOT NULL,
  "probabilityScore"        integer NOT NULL,
  confidence                integer NOT NULL,
  severity                  text NOT NULL,
  title                     text NOT NULL,
  summary                   text NOT NULL,
  "recommendedAction"       text NOT NULL,
  "relatedExternalEventIds" jsonb NOT NULL,
  evidence                  jsonb NOT NULL,
  "createdAt"               timestamptz NOT NULL DEFAULT now(),
  "updatedAt"               timestamptz NOT NULL DEFAULT now()
);

INSERT INTO "RiskAssessment" (id, "riskType", status, "probabilityBand", "probabilityScore", confidence, severity,
  title, summary, "recommendedAction", "relatedExternalEventIds", evidence, "createdAt", "updatedAt")
VALUES
  ('9b000000-0000-0000-0000-000000000001', 'INCENDIO', 'active', 'MEDIUM', 60, 75, 'HIGH',
   'Riesgo sintético de ensayo', 'Resumen sintético de riesgo', 'Acción recomendada sintética', '[]'::jsonb, '[]'::jsonb, '2026-05-08 00:00:00+00', '2026-05-08 00:00:00+00')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 12. "RiskAssessmentRevision" (1 row - assessmentId points at the row above)
-- =============================================================================
CREATE TABLE IF NOT EXISTS "RiskAssessmentRevision" (
  id                         text PRIMARY KEY,
  "assessmentId"             text NOT NULL,
  "previousStatus"           text NULL,
  "newStatus"                text NOT NULL,
  "previousProbabilityScore" integer NULL,
  "newProbabilityScore"      integer NOT NULL,
  reason                     text NOT NULL,
  evidence                   jsonb NULL,
  "createdAt"                timestamptz NOT NULL DEFAULT now()
);

INSERT INTO "RiskAssessmentRevision" (id, "assessmentId", "previousStatus", "newStatus", "previousProbabilityScore", "newProbabilityScore", reason, "createdAt")
VALUES
  ('9c000000-0000-0000-0000-000000000001', '9b000000-0000-0000-0000-000000000001', 'draft', 'active', 50, 60, 'Revisión sintética de ensayo', '2026-05-08 02:00:00+00')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 13. "HelpRequest" (0 rows - matches documented production reality; every
--     wave 050 backfill statement expects exactly 0 source rows)
-- =============================================================================
CREATE TABLE IF NOT EXISTS "HelpRequest" (
  id           text PRIMARY KEY,
  "userId"     text NOT NULL,
  category     text NOT NULL,
  title        text NOT NULL,
  description  text NOT NULL,
  latitude     double precision NOT NULL,
  longitude    double precision NOT NULL,
  priority     text NOT NULL DEFAULT 'LOW',
  status       text NOT NULL DEFAULT 'RECEIVED',
  "createdAt"  timestamptz NOT NULL DEFAULT now(),
  "updatedAt"  timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- 14. "CriticalPoi" (4 rows - 2 with a matching operational status -> route
--     A, 2 without -> route D, exercising Wave 060's full 4-way split)
-- =============================================================================
CREATE TABLE IF NOT EXISTS "CriticalPoi" (
  id                  text PRIMARY KEY,
  "externalId"        text NULL,
  source              text NOT NULL DEFAULT 'osm',
  name                text NOT NULL,
  category            text NOT NULL,
  priority            text NOT NULL,
  latitude            double precision NOT NULL,
  longitude           double precision NOT NULL,
  "countryCode"       text NULL,
  "adminLevel1"       text NULL,
  "adminLevel2"       text NULL,
  city                text NULL,
  address             text NULL,
  status              text NOT NULL DEFAULT 'active',
  confidence          integer NOT NULL DEFAULT 70,
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedAt"         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, "externalId")
);

INSERT INTO "CriticalPoi" (id, "externalId", source, name, category, priority, latitude, longitude,
  "countryCode", "adminLevel1", city, address, status, confidence, "createdAt", "updatedAt")
VALUES
  ('9d000000-0000-0000-0000-000000000001', 'osm-poi-001', 'osm', 'Albergue Sintético 1', 'shelter', 'HIGH', -33.45, -70.66, 'CL', 'Metropolitana', 'Santiago', 'Dirección sintética 1', 'active', 70, '2026-03-01 00:00:00+00', '2026-03-01 00:00:00+00'),
  ('9d000000-0000-0000-0000-000000000002', 'osm-poi-002', 'osm', 'Albergue Sintético 2', 'shelter', 'MEDIUM', -36.82, -73.05, 'CL', 'Biobío', 'Concepción', 'Dirección sintética 2', 'active', 65, '2026-03-02 00:00:00+00', '2026-03-02 00:00:00+00'),
  ('9d000000-0000-0000-0000-000000000003', 'osm-poi-003', 'osm', 'Punto Sintético 3', 'hospital', 'HIGH', -23.65, -70.40, 'CL', 'Antofagasta', 'Antofagasta', 'Dirección sintética 3', 'active', 75, '2026-03-03 00:00:00+00', '2026-03-03 00:00:00+00'),
  ('9d000000-0000-0000-0000-000000000004', 'osm-poi-004', 'osm', 'Punto Sintético 4', 'police', 'LOW', -29.90, -71.25, 'CL', 'Coquimbo', 'La Serena', 'Dirección sintética 4', 'inactive', 50, '2026-03-04 00:00:00+00', '2026-03-04 00:00:00+00')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 15. "CriticalPoiOperationalStatus" (2 rows - 1:1 with CriticalPoi rows 1
--     and 2, giving Wave 060 route (A) real rows to migrate)
-- =============================================================================
CREATE TABLE IF NOT EXISTS "CriticalPoiOperationalStatus" (
  id                   text PRIMARY KEY,
  "poiId"              text NOT NULL UNIQUE,
  "shelterStatus"      text NOT NULL DEFAULT 'unknown',
  "capacityStatus"     text NOT NULL DEFAULT 'unknown',
  "capacityTotal"      integer NULL,
  "occupancyCurrent"   integer NULL,
  "capacityDeclared"   integer NULL,
  "sourceType"         text NOT NULL,
  "sourceName"         text NOT NULL,
  confidence           integer NOT NULL DEFAULT 50,
  "verificationStatus" text NOT NULL DEFAULT 'unverified',
  "lastUpdatedAt"      timestamptz NOT NULL,
  "publicationStatus"  text NOT NULL DEFAULT 'active',
  "createdAt"          timestamptz NOT NULL DEFAULT now()
);

INSERT INTO "CriticalPoiOperationalStatus" (id, "poiId", "shelterStatus", "capacityStatus", "capacityTotal",
  "occupancyCurrent", "capacityDeclared", "sourceType", "sourceName", confidence, "verificationStatus", "lastUpdatedAt", "publicationStatus", "createdAt")
VALUES
  ('9e000000-0000-0000-0000-000000000001', '9d000000-0000-0000-0000-000000000001', 'available', 'ok', 100, 40, NULL, 'manual_operator', 'Operador Sintético', 60, 'unverified', '2026-03-05 00:00:00+00', 'active', '2026-03-01 00:00:00+00'),
  ('9e000000-0000-0000-0000-000000000002', '9d000000-0000-0000-0000-000000000002', 'near_capacity', 'near_capacity', 50, 45, NULL, 'municipality', 'Municipalidad Sintética', 70, 'corroborated', '2026-03-06 00:00:00+00', 'active', '2026-03-02 00:00:00+00')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 16. "CriticalPoiStatusEvidence" (2 rows - REL-002: no real FK to
--     CriticalPoiOperationalStatus, so poiId here intentionally covers both
--     a route-A poi (1) and a route-D-only poi (3))
-- =============================================================================
CREATE TABLE IF NOT EXISTS "CriticalPoiStatusEvidence" (
  id                text PRIMARY KEY,
  "poiId"           text NOT NULL,
  "eventType"       text NOT NULL,
  "sourceType"      text NOT NULL,
  "sourceName"      text NOT NULL,
  "confidenceScore" integer NOT NULL,
  "createdAt"       timestamptz NOT NULL DEFAULT now()
);

INSERT INTO "CriticalPoiStatusEvidence" (id, "poiId", "eventType", "sourceType", "sourceName", "confidenceScore", "createdAt")
VALUES
  ('9f000000-0000-0000-0000-000000000001', '9d000000-0000-0000-0000-000000000001', 'created', 'manual_operator', 'Operador Sintético', 60, '2026-03-01 00:00:00+00'),
  ('9f000000-0000-0000-0000-000000000002', '9d000000-0000-0000-0000-000000000003', 'capacity_updated', 'osm', 'OSM Sintético', 40, '2026-03-03 00:00:00+00')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 17. "KnowledgeLesson" (0 rows - matches documented production reality)
-- =============================================================================
CREATE TABLE IF NOT EXISTS "KnowledgeLesson" (
  id                 text PRIMARY KEY,
  "incidentId"       text NULL,
  domain             text NOT NULL,
  title              text NOT NULL,
  summary            text NOT NULL,
  "applicableToChile" boolean NOT NULL DEFAULT false,
  "confidenceScore"  integer NOT NULL,
  "createdAt"        timestamptz NOT NULL DEFAULT now(),
  "updatedAt"        timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- 18. "HazardKnowledgeDocument" (2 rows)
-- =============================================================================
CREATE TABLE IF NOT EXISTS "HazardKnowledgeDocument" (
  id                text PRIMARY KEY,
  title             text NOT NULL,
  "sourceName"      text NOT NULL,
  "sourceUrl"       text NOT NULL,
  "hazardType"      text NOT NULL,
  "ingestionStatus" text NULL DEFAULT 'queued',
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedAt"       timestamptz NOT NULL DEFAULT now()
);

INSERT INTO "HazardKnowledgeDocument" (id, title, "sourceName", "sourceUrl", "hazardType", "ingestionStatus", "createdAt", "updatedAt")
VALUES
  ('90100000-0000-0000-0000-000000000001', 'Documento Sintético 1', 'Fuente Sintética Documental', 'https://example.invalid/doc1', 'INCENDIO', 'queued', '2026-02-01 00:00:00+00', '2026-02-01 00:00:00+00'),
  ('90100000-0000-0000-0000-000000000002', 'Documento Sintético 2', 'Fuente Sintética Documental', 'https://example.invalid/doc2', 'INUNDACION', 'processed', '2026-02-02 00:00:00+00', '2026-02-02 00:00:00+00')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 19. "KnowledgeDocument" (0 rows - matches documented production reality;
--     Wave 100's dedup-guard branch only needs the table to exist)
-- =============================================================================
CREATE TABLE IF NOT EXISTS "KnowledgeDocument" (
  id                 text PRIMARY KEY,
  title              text NOT NULL,
  "documentType"     text NOT NULL DEFAULT 'unknown',
  "processingStatus" text NOT NULL DEFAULT 'normalized',
  "reviewStatus"     text NOT NULL DEFAULT 'pending_review',
  "createdAt"        timestamptz NOT NULL DEFAULT now(),
  "updatedAt"        timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- 20. "HazardKnowledgeFact" (2 rows - documentId always resolves to a row in
--     "HazardKnowledgeDocument" above, since knowledge.knowledge_facts.
--     knowledge_document_id is NOT NULL in the target schema and
--     Wave 100's backfill.sql §3 note documents that an unresolved
--     documentId would fail that constraint - not something to construct in
--     fixture data). Row 1's hazardType matches a seeded governance.
--     hazard_types code (AUTO_MAPPED branch); row 2's does not (REQUIRES_
--     REVIEW branch), covering both paths in Wave 100's join.
-- =============================================================================
CREATE TABLE IF NOT EXISTS "HazardKnowledgeFact" (
  id                  text PRIMARY KEY,
  "documentId"        text NULL,
  "hazardType"        text NOT NULL,
  "knowledgeType"     text NOT NULL,
  title               text NOT NULL,
  summary             text NOT NULL,
  confidence          integer NOT NULL,
  "sourceName"        text NOT NULL,
  "sourceUrl"         text NOT NULL,
  "extractionStatus"  text NULL DEFAULT 'manual_review',
  "createdAt"         timestamptz NOT NULL DEFAULT now(),
  "updatedAt"         timestamptz NOT NULL DEFAULT now()
);

INSERT INTO "HazardKnowledgeFact" (id, "documentId", "hazardType", "knowledgeType", title, summary, confidence,
  "sourceName", "sourceUrl", "extractionStatus", "createdAt", "updatedAt")
VALUES
  ('90200000-0000-0000-0000-000000000001', '90100000-0000-0000-0000-000000000001', 'INCENDIO', 'LESSON', 'Hecho Sintético 1', 'Resumen sintético de hecho 1', 70, 'Fuente Sintética Documental', 'https://example.invalid/doc1', 'manual_review', '2026-02-05 00:00:00+00', '2026-02-05 00:00:00+00'),
  ('90200000-0000-0000-0000-000000000002', '90100000-0000-0000-0000-000000000002', 'UNKNOWN_TYPE', 'STATISTIC', 'Hecho Sintético 2', 'Resumen sintético de hecho 2', 55, 'Fuente Sintética Documental', 'https://example.invalid/doc2', 'manual_review', '2026-02-06 00:00:00+00', '2026-02-06 00:00:00+00')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 21. "PreparednessProfile" / "FamilyPlan" (0 rows) - no backfill.sql reads
-- these; they exist here only because Wave 100's migration.sql defines
-- proj.legacy_vesta_preparedness_profiles (D-03, permanent read-only VESTA
-- passthrough), a plain view whose CREATE VIEW validates the referenced
-- tables/columns exist at creation time, not just at query time.
-- =============================================================================
CREATE TABLE IF NOT EXISTS "PreparednessProfile" (
  id                 text PRIMARY KEY,
  "userId"           text NOT NULL UNIQUE,
  "riskContextsJson" jsonb NULL,
  "lastFullReviewAt" timestamptz NULL,
  "createdAt"        timestamptz NOT NULL DEFAULT now(),
  "updatedAt"        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "FamilyPlan" (
  id                     text PRIMARY KEY,
  "profileId"            text NOT NULL UNIQUE,
  "membersJson"          jsonb NULL,
  "primaryMeetingPoint"  text NULL,
  "alternateMeetingPoint" text NULL,
  "evacuationRouteNotes" text NULL,
  "medicalNeedsNotes"    text NULL,
  "petsNotes"            text NULL,
  observations           text NULL,
  "createdAt"            timestamptz NOT NULL DEFAULT now(),
  "updatedAt"            timestamptz NOT NULL DEFAULT now()
);

COMMIT;
