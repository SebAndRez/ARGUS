-- ARGUS Shelter Operational Status: real-time capacity/occupancy/services/route
-- overlay for CriticalPoi rows of category "shelter", plus a per-source evidence
-- trail for dedup, precedence and audit history. Extends CriticalPoi (see
-- 202607070001_add_critical_poi) rather than duplicating the location/identity
-- entity. Non-destructive migration: creates two new tables and indexes only,
-- no changes to existing tables.

CREATE TABLE "CriticalPoiOperationalStatus" (
  "id"                 TEXT NOT NULL,
  "poiId"              TEXT NOT NULL,
  "shelterStatus"      TEXT NOT NULL DEFAULT 'unknown',
  "capacityStatus"     TEXT NOT NULL DEFAULT 'unknown',
  "capacityTotal"      INTEGER,
  "occupancyCurrent"   INTEGER,
  "hasWater"           BOOLEAN,
  "hasElectricity"     BOOLEAN,
  "hasFood"            BOOLEAN,
  "hasMedical"         BOOLEAN,
  "hasHeating"         BOOLEAN,
  "hasBathrooms"       BOOLEAN,
  "hasShowers"         BOOLEAN,
  "isAccessible"       BOOLEAN,
  "allowsPets"         BOOLEAN,
  "hasConnectivity"    BOOLEAN,
  "operatorName"       TEXT,
  "contactPhone"       TEXT,
  "contactNotes"       TEXT,
  "routeStatus"        TEXT,
  "sourceType"         TEXT NOT NULL,
  "sourceName"         TEXT NOT NULL,
  "sourceUrl"          TEXT,
  "sourcePublishedAt"  TIMESTAMP(3),
  "confidence"         INTEGER NOT NULL DEFAULT 50,
  "verificationStatus" TEXT NOT NULL DEFAULT 'unverified',
  "lastUpdatedAt"      TIMESTAMP(3) NOT NULL,
  "lastVerifiedAt"     TIMESTAMP(3),
  "isStale"            BOOLEAN NOT NULL DEFAULT false,
  "linkedIncidentId"   TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CriticalPoiOperationalStatus_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CriticalPoiOperationalStatus_poiId_key" ON "CriticalPoiOperationalStatus"("poiId");
CREATE INDEX "CriticalPoiOperationalStatus_shelterStatus_idx" ON "CriticalPoiOperationalStatus"("shelterStatus");
CREATE INDEX "CriticalPoiOperationalStatus_isStale_idx" ON "CriticalPoiOperationalStatus"("isStale");
CREATE INDEX "CriticalPoiOperationalStatus_linkedIncidentId_idx" ON "CriticalPoiOperationalStatus"("linkedIncidentId");

ALTER TABLE "CriticalPoiOperationalStatus" ADD CONSTRAINT "CriticalPoiOperationalStatus_poiId_fkey"
  FOREIGN KEY ("poiId") REFERENCES "CriticalPoi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CriticalPoiStatusEvidence" (
  "id"                TEXT NOT NULL,
  "poiId"             TEXT NOT NULL,
  "eventType"         TEXT NOT NULL,
  "sourceType"        TEXT NOT NULL,
  "sourceName"         TEXT NOT NULL,
  "sourceUrl"         TEXT,
  "sourcePublishedAt" TIMESTAMP(3),
  "confidenceScore"   INTEGER NOT NULL,
  "payloadJson"       JSONB,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CriticalPoiStatusEvidence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CriticalPoiStatusEvidence_poiId_idx" ON "CriticalPoiStatusEvidence"("poiId");
CREATE INDEX "CriticalPoiStatusEvidence_eventType_idx" ON "CriticalPoiStatusEvidence"("eventType");
