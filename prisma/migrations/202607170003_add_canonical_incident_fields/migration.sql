-- ARGUS Fusion Engine — Fase C (persistencia canonica).
-- Aditivo: solo columnas nullable nuevas en KnowledgeIncident y 2 tablas
-- nuevas (IncidentRelation, IncidentTransition). No modifica ninguna
-- columna/tabla/constraint existente.

-- AlterTable
ALTER TABLE "KnowledgeIncident" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "canonicalKey" TEXT,
ADD COLUMN     "confidenceLevel" TEXT,
ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "effectiveSeverity" TEXT,
ADD COLUMN     "evidenceCount" INTEGER,
ADD COLUMN     "isOfficial" BOOLEAN,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "scope" TEXT,
ADD COLUMN     "sourceCount" INTEGER,
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "status" TEXT,
ADD COLUMN     "verificationStatus" TEXT;

-- CreateTable
CREATE TABLE "IncidentRelation" (
    "id" TEXT NOT NULL,
    "fromIncidentId" TEXT NOT NULL,
    "toIncidentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "explanation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentTransition" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "previousStatus" TEXT,
    "newStatus" TEXT,
    "previousSeverity" TEXT,
    "newSeverity" TEXT,
    "reason" TEXT NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentTransition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IncidentRelation_fromIncidentId_idx" ON "IncidentRelation"("fromIncidentId");

-- CreateIndex
CREATE INDEX "IncidentRelation_toIncidentId_idx" ON "IncidentRelation"("toIncidentId");

-- CreateIndex
CREATE INDEX "IncidentRelation_kind_idx" ON "IncidentRelation"("kind");

-- CreateIndex
CREATE INDEX "IncidentTransition_incidentId_idx" ON "IncidentTransition"("incidentId");

-- CreateIndex
CREATE INDEX "IncidentTransition_createdAt_idx" ON "IncidentTransition"("createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeIncident_status_idx" ON "KnowledgeIncident"("status");

-- CreateIndex
CREATE INDEX "KnowledgeIncident_effectiveSeverity_idx" ON "KnowledgeIncident"("effectiveSeverity");

-- CreateIndex
CREATE INDEX "KnowledgeIncident_canonicalKey_idx" ON "KnowledgeIncident"("canonicalKey");
