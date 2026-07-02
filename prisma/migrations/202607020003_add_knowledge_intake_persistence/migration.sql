-- ARGUS Knowledge Intake persistence tables.
-- Non-destructive migration: creates new tables and indexes only.

CREATE TABLE "KnowledgeSource" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "domainsJson" JSONB NOT NULL,
  "coverage" JSONB,
  "accessType" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "licenseNotes" TEXT NOT NULL,
  "updateCadence" TEXT,
  "reliabilityScore" INTEGER NOT NULL,
  "officialSource" BOOLEAN NOT NULL DEFAULT false,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KnowledgeSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KnowledgeIngestionRun" (
  "id" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "sourceName" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "recordsFetched" INTEGER NOT NULL DEFAULT 0,
  "recordsNormalized" INTEGER NOT NULL DEFAULT 0,
  "recordsInserted" INTEGER NOT NULL DEFAULT 0,
  "recordsUpdated" INTEGER NOT NULL DEFAULT 0,
  "recordsSkipped" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "warningsJson" JSONB,
  "metadataJson" JSONB,
  CONSTRAINT "KnowledgeIngestionRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KnowledgeIncident" (
  "id" TEXT NOT NULL,
  "externalId" TEXT,
  "sourceId" TEXT NOT NULL,
  "sourceName" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "subtype" TEXT,
  "severity" TEXT NOT NULL,
  "confidenceScore" INTEGER NOT NULL,
  "actionabilityScore" INTEGER NOT NULL,
  "sourceReliabilityScore" INTEGER NOT NULL,
  "occurredAt" TIMESTAMP(3),
  "detectedAt" TIMESTAMP(3),
  "country" TEXT,
  "region" TEXT,
  "locality" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "geometryJson" JSONB,
  "casualtiesJson" JSONB,
  "impactJson" JSONB,
  "technicalFactorsJson" JSONB,
  "causesJson" JSONB,
  "contributingFactorsJson" JSONB,
  "responseActionsJson" JSONB,
  "lessonsLearnedJson" JSONB,
  "recommendedActionsJson" JSONB,
  "relatedHistoricalEventsJson" JSONB,
  "similarIncidentIdsJson" JSONB,
  "tagsJson" JSONB,
  "language" TEXT,
  "rawEvidenceRefsJson" JSONB,
  "reviewStatus" TEXT NOT NULL DEFAULT 'pending_review',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KnowledgeIncident_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KnowledgeEvidence" (
  "id" TEXT NOT NULL,
  "incidentId" TEXT,
  "sourceId" TEXT NOT NULL,
  "sourceName" TEXT NOT NULL,
  "evidenceType" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "url" TEXT,
  "excerpt" TEXT,
  "rawRef" TEXT,
  "confidenceScore" INTEGER NOT NULL,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KnowledgeEvidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KnowledgeLesson" (
  "id" TEXT NOT NULL,
  "incidentId" TEXT,
  "domain" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "whatFailedJson" JSONB,
  "whatWorkedJson" JSONB,
  "earlyWarningSignalsJson" JSONB,
  "recommendedPreventiveActionsJson" JSONB,
  "recommendedResponseActionsJson" JSONB,
  "applicableToChile" BOOLEAN NOT NULL DEFAULT false,
  "confidenceScore" INTEGER NOT NULL,
  "tagsJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KnowledgeLesson_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KnowledgeDocument" (
  "id" TEXT NOT NULL,
  "sourceId" TEXT,
  "title" TEXT NOT NULL,
  "fileName" TEXT,
  "fileMimeType" TEXT,
  "sourceUrl" TEXT,
  "documentType" TEXT NOT NULL DEFAULT 'unknown',
  "language" TEXT,
  "country" TEXT,
  "rawText" TEXT,
  "metadataJson" JSONB,
  "processingStatus" TEXT NOT NULL DEFAULT 'normalized',
  "reviewStatus" TEXT NOT NULL DEFAULT 'pending_review',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KnowledgeDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KnowledgeDocumentChunk" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "chunkIndex" INTEGER NOT NULL,
  "text" TEXT NOT NULL,
  "tokenEstimate" INTEGER NOT NULL,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KnowledgeDocumentChunk_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KnowledgeEmbeddingRecord" (
  "id" TEXT NOT NULL,
  "documentId" TEXT,
  "chunkId" TEXT,
  "incidentId" TEXT,
  "embeddingProvider" TEXT NOT NULL,
  "embeddingModel" TEXT NOT NULL,
  "vectorRef" TEXT,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KnowledgeEmbeddingRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KnowledgeAdminReview" (
  "id" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "reviewerId" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KnowledgeAdminReview_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "KnowledgeSource_status_idx" ON "KnowledgeSource"("status");
CREATE INDEX "KnowledgeSource_enabled_idx" ON "KnowledgeSource"("enabled");
CREATE INDEX "KnowledgeIngestionRun_sourceId_idx" ON "KnowledgeIngestionRun"("sourceId");
CREATE INDEX "KnowledgeIngestionRun_status_idx" ON "KnowledgeIngestionRun"("status");
CREATE INDEX "KnowledgeIngestionRun_startedAt_idx" ON "KnowledgeIngestionRun"("startedAt");
CREATE UNIQUE INDEX "KnowledgeIncident_sourceId_externalId_key" ON "KnowledgeIncident"("sourceId", "externalId");
CREATE INDEX "KnowledgeIncident_sourceId_idx" ON "KnowledgeIncident"("sourceId");
CREATE INDEX "KnowledgeIncident_domain_idx" ON "KnowledgeIncident"("domain");
CREATE INDEX "KnowledgeIncident_severity_idx" ON "KnowledgeIncident"("severity");
CREATE INDEX "KnowledgeIncident_reviewStatus_idx" ON "KnowledgeIncident"("reviewStatus");
CREATE INDEX "KnowledgeIncident_occurredAt_idx" ON "KnowledgeIncident"("occurredAt");
CREATE INDEX "KnowledgeIncident_latitude_longitude_idx" ON "KnowledgeIncident"("latitude", "longitude");
CREATE INDEX "KnowledgeEvidence_incidentId_idx" ON "KnowledgeEvidence"("incidentId");
CREATE INDEX "KnowledgeEvidence_sourceId_idx" ON "KnowledgeEvidence"("sourceId");
CREATE INDEX "KnowledgeLesson_incidentId_idx" ON "KnowledgeLesson"("incidentId");
CREATE INDEX "KnowledgeLesson_domain_idx" ON "KnowledgeLesson"("domain");
CREATE INDEX "KnowledgeDocument_sourceId_idx" ON "KnowledgeDocument"("sourceId");
CREATE INDEX "KnowledgeDocument_documentType_idx" ON "KnowledgeDocument"("documentType");
CREATE INDEX "KnowledgeDocument_reviewStatus_idx" ON "KnowledgeDocument"("reviewStatus");
CREATE UNIQUE INDEX "KnowledgeDocumentChunk_documentId_chunkIndex_key" ON "KnowledgeDocumentChunk"("documentId", "chunkIndex");
CREATE INDEX "KnowledgeDocumentChunk_documentId_idx" ON "KnowledgeDocumentChunk"("documentId");
CREATE INDEX "KnowledgeEmbeddingRecord_documentId_idx" ON "KnowledgeEmbeddingRecord"("documentId");
CREATE INDEX "KnowledgeEmbeddingRecord_chunkId_idx" ON "KnowledgeEmbeddingRecord"("chunkId");
CREATE INDEX "KnowledgeEmbeddingRecord_incidentId_idx" ON "KnowledgeEmbeddingRecord"("incidentId");
CREATE INDEX "KnowledgeAdminReview_targetType_targetId_idx" ON "KnowledgeAdminReview"("targetType", "targetId");
CREATE INDEX "KnowledgeAdminReview_status_idx" ON "KnowledgeAdminReview"("status");
