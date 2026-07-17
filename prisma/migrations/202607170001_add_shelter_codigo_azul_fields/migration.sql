-- ARGUS Codigo Azul shelter ingestion: two additive fields on
-- CriticalPoiOperationalStatus. capacityDeclared is a source-reported
-- number (e.g. "Cupos" published by Codigo Azul) with no confirmed
-- administrative meaning -- it must NEVER feed capacityStatus/
-- capacityAvailable, which stay reserved for confirmed capacityTotal +
-- occupancyCurrent from a higher-precedence source. publicationStatus
-- tracks whether a record is still present in its source feed (distinct
-- from shelterStatus, the physical open/closed state). Non-destructive
-- migration: ALTER TABLE ADD COLUMN + one index, no data loss.

ALTER TABLE "CriticalPoiOperationalStatus" ADD COLUMN "capacityDeclared" INTEGER;
ALTER TABLE "CriticalPoiOperationalStatus" ADD COLUMN "publicationStatus" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "CriticalPoiOperationalStatus" ADD COLUMN "operatingHours" TEXT;

CREATE INDEX "CriticalPoiOperationalStatus_publicationStatus_idx" ON "CriticalPoiOperationalStatus"("publicationStatus");
