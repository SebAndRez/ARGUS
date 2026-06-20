-- CreateTable
CREATE TABLE "ExternalEvent" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" TEXT,
    "confidence" INTEGER,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "locationName" TEXT,
    "country" TEXT,
    "sourceUrl" TEXT,
    "occurredAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "raw" JSONB,
    "normalized" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionRun" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "count" INTEGER,
    "cached" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "durationMs" INTEGER,
    "metadata" JSONB,

    CONSTRAINT "IngestionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalEventCorrelation" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "confidence" INTEGER,
    "explanation" TEXT,
    "sourceIds" JSONB NOT NULL,
    "eventIds" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "ExternalEventCorrelation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExternalEvent_sourceId_idx" ON "ExternalEvent"("sourceId");

-- CreateIndex
CREATE INDEX "ExternalEvent_category_idx" ON "ExternalEvent"("category");

-- CreateIndex
CREATE INDEX "ExternalEvent_occurredAt_idx" ON "ExternalEvent"("occurredAt");

-- CreateIndex
CREATE INDEX "ExternalEvent_severity_idx" ON "ExternalEvent"("severity");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalEvent_sourceId_externalId_key" ON "ExternalEvent"("sourceId", "externalId");

-- CreateIndex
CREATE INDEX "IngestionRun_sourceId_idx" ON "IngestionRun"("sourceId");

-- CreateIndex
CREATE INDEX "IngestionRun_fetchedAt_idx" ON "IngestionRun"("fetchedAt");

-- CreateIndex
CREATE INDEX "ExternalEventCorrelation_kind_idx" ON "ExternalEventCorrelation"("kind");

-- CreateIndex
CREATE INDEX "ExternalEventCorrelation_createdAt_idx" ON "ExternalEventCorrelation"("createdAt");
