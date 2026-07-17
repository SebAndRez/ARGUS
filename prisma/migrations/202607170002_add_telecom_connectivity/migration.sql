-- ARGUS Emergency Connectivity / National Roaming: regional/comunal state of
-- Roaming Automatico Nacional / Roaming de Emergencia / network degradation,
-- plus a per-source evidence trail covering both the regional status and
-- telecom connectivity points (mobile units, emergency wifi, charging
-- points, which are persisted as CriticalPoi rows, not a new table here).
-- Non-destructive migration: creates two new tables and indexes only, no
-- changes to existing tables.

CREATE TABLE "TelecomConnectivityStatus" (
  "id"                 TEXT NOT NULL,
  "countryCode"        TEXT NOT NULL DEFAULT 'CL',
  "adminLevel1"        TEXT NOT NULL,
  "adminLevel2"        TEXT,
  "carrierScope"       TEXT NOT NULL DEFAULT 'all_carriers',
  "roamingType"        TEXT NOT NULL DEFAULT 'none',
  "networkState"       TEXT NOT NULL DEFAULT 'unknown',
  "activationScope"    TEXT,
  "centroidLatitude"   DOUBLE PRECISION,
  "centroidLongitude"  DOUBLE PRECISION,
  "startedAt"          TIMESTAMP(3),
  "endedAt"            TIMESTAMP(3),
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
  CONSTRAINT "TelecomConnectivityStatus_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelecomConnectivityStatus_countryCode_adminLevel1_adminLev_key" ON "TelecomConnectivityStatus"("countryCode", "adminLevel1", "adminLevel2", "carrierScope");
CREATE INDEX "TelecomConnectivityStatus_adminLevel1_idx" ON "TelecomConnectivityStatus"("adminLevel1");
CREATE INDEX "TelecomConnectivityStatus_roamingType_idx" ON "TelecomConnectivityStatus"("roamingType");
CREATE INDEX "TelecomConnectivityStatus_networkState_idx" ON "TelecomConnectivityStatus"("networkState");
CREATE INDEX "TelecomConnectivityStatus_isStale_idx" ON "TelecomConnectivityStatus"("isStale");

CREATE TABLE "TelecomConnectivityEvidence" (
  "id"                TEXT NOT NULL,
  "subjectType"       TEXT NOT NULL,
  "regionKey"         TEXT,
  "poiId"             TEXT,
  "eventType"         TEXT NOT NULL,
  "sourceType"        TEXT NOT NULL,
  "sourceName"        TEXT NOT NULL,
  "sourceUrl"         TEXT,
  "sourcePublishedAt" TIMESTAMP(3),
  "confidenceScore"   INTEGER NOT NULL,
  "payloadJson"       JSONB,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelecomConnectivityEvidence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TelecomConnectivityEvidence_regionKey_idx" ON "TelecomConnectivityEvidence"("regionKey");
CREATE INDEX "TelecomConnectivityEvidence_poiId_idx" ON "TelecomConnectivityEvidence"("poiId");
CREATE INDEX "TelecomConnectivityEvidence_eventType_idx" ON "TelecomConnectivityEvidence"("eventType");
