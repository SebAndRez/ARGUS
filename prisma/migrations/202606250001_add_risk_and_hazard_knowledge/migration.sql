-- CreateTable
CREATE TABLE "RiskAssessment" (
    "id" TEXT NOT NULL,
    "riskType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "probabilityBand" TEXT NOT NULL,
    "probabilityScore" INTEGER NOT NULL,
    "confidence" INTEGER NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "recommendedAction" TEXT NOT NULL,
    "timeframe" TEXT,
    "relatedExternalEventIds" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "nextReviewAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "RiskAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskAssessmentRevision" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "previousStatus" TEXT,
    "newStatus" TEXT NOT NULL,
    "previousProbabilityScore" INTEGER,
    "newProbabilityScore" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskAssessmentRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HazardKnowledgeDocument" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "publisher" TEXT,
    "country" TEXT,
    "hazardType" TEXT NOT NULL,
    "language" TEXT,
    "publishedYear" INTEGER,
    "notes" TEXT,
    "documentCategory" TEXT,
    "ingestionStatus" TEXT DEFAULT 'queued',
    "priority" INTEGER DEFAULT 3,
    "reliabilityScore" INTEGER DEFAULT 80,
    "publicationYear" INTEGER,
    "institution" TEXT,
    "countryFocus" TEXT,
    "regionFocus" TEXT,
    "hazardTypes" JSONB,
    "tags" JSONB,
    "limitationNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HazardKnowledgeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HazardKnowledgeFact" (
    "id" TEXT NOT NULL,
    "documentId" TEXT,
    "hazardType" TEXT NOT NULL,
    "knowledgeType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "country" TEXT,
    "region" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "year" INTEGER,
    "eventDate" TIMESTAMP(3),
    "magnitude" DOUBLE PRECISION,
    "magnitudeLabel" TEXT,
    "depthKm" DOUBLE PRECISION,
    "ruptureLengthKm" DOUBLE PRECISION,
    "maxSeaLevelVariationM" DOUBLE PRECISION,
    "affectedCoastKm" DOUBLE PRECISION,
    "casualtiesText" TEXT,
    "confidence" INTEGER NOT NULL,
    "tags" JSONB,
    "sourceName" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "documentCategory" TEXT,
    "relevanceScore" INTEGER DEFAULT 50,
    "limitationNote" TEXT,
    "extractionStatus" TEXT DEFAULT 'manual_review',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HazardKnowledgeFact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RiskAssessment_riskType_idx" ON "RiskAssessment"("riskType");

-- CreateIndex
CREATE INDEX "RiskAssessment_status_idx" ON "RiskAssessment"("status");

-- CreateIndex
CREATE INDEX "RiskAssessment_probabilityBand_idx" ON "RiskAssessment"("probabilityBand");

-- CreateIndex
CREATE INDEX "RiskAssessment_createdAt_idx" ON "RiskAssessment"("createdAt");

-- CreateIndex
CREATE INDEX "HazardKnowledgeFact_hazardType_idx" ON "HazardKnowledgeFact"("hazardType");

-- CreateIndex
CREATE INDEX "HazardKnowledgeFact_country_idx" ON "HazardKnowledgeFact"("country");

-- CreateIndex
CREATE INDEX "HazardKnowledgeFact_region_idx" ON "HazardKnowledgeFact"("region");

-- CreateIndex
CREATE INDEX "HazardKnowledgeFact_year_idx" ON "HazardKnowledgeFact"("year");

-- CreateIndex
CREATE INDEX "HazardKnowledgeFact_magnitude_idx" ON "HazardKnowledgeFact"("magnitude");

