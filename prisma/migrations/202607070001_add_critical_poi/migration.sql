-- ARGUS Critical Infrastructure POIs: persistent, priority-tiered points (hospitals,
-- police, government, mass transit, justice, shelters, logistics) reusable across
-- AURA/FENIX/ARCA/NEXUS/ATLAS/VIGIA/HERMES/ORACULO. Distinct from ExternalEvent
-- (incidents) and KnowledgeEvidence (per-incident context snapshots).
-- Non-destructive migration: creates a new table and indexes only.

CREATE TABLE "CriticalPoi" (
  "id" TEXT NOT NULL,
  "externalId" TEXT,
  "source" TEXT NOT NULL DEFAULT 'osm',
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "priority" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "countryCode" TEXT,
  "adminLevel1" TEXT,
  "adminLevel2" TEXT,
  "city" TEXT,
  "address" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "confidence" INTEGER NOT NULL DEFAULT 70,
  "lastSeenAt" TIMESTAMP(3),
  "lastVerifiedAt" TIMESTAMP(3),
  "tagsJson" JSONB,
  "sourceUrl" TEXT,
  "isPersistent" BOOLEAN NOT NULL DEFAULT true,
  "isVisibleByDefault" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CriticalPoi_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CriticalPoi_source_externalId_key" ON "CriticalPoi"("source", "externalId");
CREATE INDEX "CriticalPoi_category_idx" ON "CriticalPoi"("category");
CREATE INDEX "CriticalPoi_priority_idx" ON "CriticalPoi"("priority");
CREATE INDEX "CriticalPoi_latitude_longitude_idx" ON "CriticalPoi"("latitude", "longitude");
CREATE INDEX "CriticalPoi_countryCode_idx" ON "CriticalPoi"("countryCode");
CREATE INDEX "CriticalPoi_status_idx" ON "CriticalPoi"("status");
