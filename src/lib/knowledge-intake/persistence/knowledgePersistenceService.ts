import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  findExistingIncident,
  getExternalIdFromIncident,
  shouldUpdateExistingIncident,
} from "@/lib/knowledge-intake/persistence/knowledgeDeduplication";
import type {
  ArgusIncidentKnowledge,
  ArgusKnowledgeEvidenceItem,
  ArgusKnowledgeParsedDocument,
  ArgusKnowledgeSource,
  ArgusLessonLearned,
} from "@/types/knowledgeIntake";

type IngestionRunStatus =
  | "success"
  | "partial"
  | "failed"
  | "skipped"
  | "requiresConfiguration"
  | "requiresApiKey";

type KnowledgeDocumentInput = {
  sourceId?: string;
  title: string;
  fileName?: string;
  fileMimeType?: string;
  sourceUrl?: string;
  documentType?: string;
  language?: string;
  country?: string;
  rawText?: string;
  metadataJson?: Prisma.InputJsonValue;
  processingStatus?: string;
  reviewStatus?: string;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function parseDate(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

function reviewStatusForIncident(incident: ArgusIncidentKnowledge) {
  if (incident.confidenceScore >= 80 && incident.sourceReliabilityScore >= 85) return "auto_accepted";
  if (incident.confidenceScore < 55) return "needs_more_evidence";
  return "pending_review";
}

function incidentCreateData(incident: ArgusIncidentKnowledge): Prisma.KnowledgeIncidentUncheckedCreateInput {
  return {
    externalId: getExternalIdFromIncident(incident),
    sourceId: incident.sourceIds[0] ?? "unknown",
    sourceName: incident.sourceNames[0] ?? "Unknown source",
    title: incident.title,
    summary: incident.summary,
    domain: incident.domain,
    subtype: incident.subtype,
    severity: incident.severity,
    confidenceScore: incident.confidenceScore,
    actionabilityScore: incident.actionabilityScore,
    sourceReliabilityScore: incident.sourceReliabilityScore,
    occurredAt: parseDate(incident.occurredAt),
    detectedAt: parseDate(incident.detectedAt),
    country: incident.country,
    region: incident.region,
    locality: incident.locality,
    latitude: incident.latitude,
    longitude: incident.longitude,
    geometryJson: toJson(incident.geometry),
    casualtiesJson: toJson(incident.casualties),
    impactJson: toJson(incident.impact),
    technicalFactorsJson: toJson(incident.technicalFactors),
    causesJson: toJson(incident.causes),
    contributingFactorsJson: toJson(incident.contributingFactors),
    responseActionsJson: toJson(incident.responseActions),
    lessonsLearnedJson: toJson(incident.lessonsLearned),
    recommendedActionsJson: toJson(incident.recommendedActions),
    relatedHistoricalEventsJson: toJson(incident.relatedHistoricalEvents),
    similarIncidentIdsJson: toJson(incident.similarIncidentIds),
    tagsJson: toJson(incident.tags),
    language: incident.language,
    rawEvidenceRefsJson: toJson(incident.rawEvidenceRefs),
    reviewStatus: reviewStatusForIncident(incident),
  };
}

export async function upsertKnowledgeSource(source: ArgusKnowledgeSource) {
  return prisma.knowledgeSource.upsert({
    where: { id: source.id },
    create: {
      id: source.id,
      name: source.name,
      description: source.description,
      domainsJson: toJson(source.domains),
      coverage: toJson(source.coverage),
      accessType: source.accessMethod,
      status: source.status,
      licenseNotes: source.licenseNotes,
      updateCadence: source.updateCadence,
      reliabilityScore: source.reliabilityScore.finalScore,
      officialSource: source.reliabilityScore.finalScore >= 90,
      enabled: source.status === "active",
    },
    update: {
      name: source.name,
      description: source.description,
      domainsJson: toJson(source.domains),
      coverage: toJson(source.coverage),
      accessType: source.accessMethod,
      status: source.status,
      licenseNotes: source.licenseNotes,
      updateCadence: source.updateCadence,
      reliabilityScore: source.reliabilityScore.finalScore,
      officialSource: source.reliabilityScore.finalScore >= 90,
      enabled: source.status === "active",
    },
  });
}

export async function createIngestionRun(input: {
  sourceId: string;
  sourceName: string;
  status?: IngestionRunStatus;
  metadataJson?: Prisma.InputJsonValue;
}) {
  return prisma.knowledgeIngestionRun.create({
    data: {
      sourceId: input.sourceId,
      sourceName: input.sourceName,
      status: input.status ?? "partial",
      metadataJson: input.metadataJson,
    },
  });
}

export async function finishIngestionRun(
  runId: string,
  result: {
    status: IngestionRunStatus;
    recordsFetched?: number;
    recordsNormalized?: number;
    recordsInserted?: number;
    recordsUpdated?: number;
    recordsSkipped?: number;
    errorMessage?: string;
    warningsJson?: Prisma.InputJsonValue;
    metadataJson?: Prisma.InputJsonValue;
  }
) {
  return prisma.knowledgeIngestionRun.update({
    where: { id: runId },
    data: {
      status: result.status,
      finishedAt: new Date(),
      recordsFetched: result.recordsFetched ?? 0,
      recordsNormalized: result.recordsNormalized ?? 0,
      recordsInserted: result.recordsInserted ?? 0,
      recordsUpdated: result.recordsUpdated ?? 0,
      recordsSkipped: result.recordsSkipped ?? 0,
      errorMessage: result.errorMessage,
      warningsJson: result.warningsJson,
      metadataJson: result.metadataJson,
    },
  });
}

export async function saveKnowledgeIncident(incident: ArgusIncidentKnowledge) {
  return prisma.knowledgeIncident.create({ data: incidentCreateData(incident) });
}

export async function upsertKnowledgeIncidentByExternalId(incident: ArgusIncidentKnowledge) {
  const existing = await findExistingIncident(incident);
  const data = incidentCreateData(incident);
  if (!existing) {
    return { action: "inserted" as const, incident: await prisma.knowledgeIncident.create({ data }) };
  }
  if (!shouldUpdateExistingIncident(existing, incident)) {
    return { action: "skipped" as const, incident: existing };
  }
  return {
    action: "updated" as const,
    incident: await prisma.knowledgeIncident.update({
      where: { id: existing.id },
      data: {
        ...data,
        externalId: data.externalId,
        sourceId: data.sourceId,
      },
    }),
  };
}

export async function saveKnowledgeEvidence(evidence: ArgusKnowledgeEvidenceItem) {
  return prisma.knowledgeEvidence.create({
    data: {
      incidentId: evidence.incidentId,
      sourceId: evidence.sourceId,
      sourceName: evidence.sourceName,
      evidenceType: "source_report",
      title: evidence.title,
      url: evidence.url,
      excerpt: evidence.quote ?? evidence.summary,
      rawRef: evidence.id,
      confidenceScore: evidence.confidenceScore.finalConfidence,
      metadataJson: toJson({
        locationConfidence: evidence.locationConfidence,
        timestampConfidence: evidence.timestampConfidence,
        conflicts: evidence.conflicts,
      }),
    },
  });
}

export async function saveKnowledgeLesson(lesson: ArgusLessonLearned, incidentIdOverride?: string) {
  return prisma.knowledgeLesson.create({
    data: {
      incidentId: incidentIdOverride ?? lesson.sourceIncidentId,
      domain: lesson.domain,
      title: lesson.title,
      summary: lesson.summary,
      whatFailedJson: toJson(lesson.whatFailed),
      whatWorkedJson: toJson(lesson.whatWorked),
      earlyWarningSignalsJson: toJson(lesson.earlyWarningSignals),
      recommendedPreventiveActionsJson: toJson(lesson.recommendedPreventiveActions),
      recommendedResponseActionsJson: toJson(lesson.recommendedResponseActions),
      applicableToChile: lesson.applicableToChile,
      confidenceScore: lesson.confidenceScore,
      tagsJson: toJson(lesson.tags),
    },
  });
}

export async function saveKnowledgeDocument(document: KnowledgeDocumentInput | ArgusKnowledgeParsedDocument) {
  const input = "rawDocumentId" in document
    ? {
        title: document.title ?? "Knowledge document",
        rawText: document.text,
        metadataJson: toJson(document.metadata),
        language: document.language,
        processingStatus: document.needsOcr ? "needs_ocr" : "normalized",
      }
    : document;
  return prisma.knowledgeDocument.create({
    data: {
      title: input.title,
      sourceId: input.sourceId,
      fileName: input.fileName,
      fileMimeType: input.fileMimeType,
      sourceUrl: input.sourceUrl,
      documentType: input.documentType ?? "unknown",
      language: input.language,
      country: input.country,
      rawText: input.rawText,
      metadataJson: input.metadataJson,
      processingStatus: input.processingStatus ?? "normalized",
      reviewStatus: input.reviewStatus ?? "pending_review",
    },
  });
}

export async function saveKnowledgeDocumentChunks(
  documentId: string,
  chunks: Array<{ chunkIndex: number; text: string; tokenEstimate: number; metadataJson?: Prisma.InputJsonValue }>
) {
  if (chunks.length === 0) return { count: 0 };
  return prisma.knowledgeDocumentChunk.createMany({
    data: chunks.map((chunk) => ({ ...chunk, documentId })),
    skipDuplicates: true,
  });
}

export async function getKnowledgeIncidents(filters: {
  domain?: string;
  sourceId?: string;
  reviewStatus?: string;
  minConfidence?: number;
  since?: string;
  withCoordinates?: boolean;
  limit?: number;
} = {}) {
  return prisma.knowledgeIncident.findMany({
    where: {
      ...(filters.domain ? { domain: filters.domain } : {}),
      ...(filters.sourceId ? { sourceId: filters.sourceId } : {}),
      ...(filters.reviewStatus ? { reviewStatus: filters.reviewStatus } : {}),
      ...(typeof filters.minConfidence === "number" ? { confidenceScore: { gte: filters.minConfidence } } : {}),
      ...(filters.since ? { occurredAt: { gte: parseDate(filters.since) } } : {}),
      ...(filters.withCoordinates ? { latitude: { not: null }, longitude: { not: null } } : {}),
    },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take: Math.min(Math.max(filters.limit ?? 50, 1), 200),
  });
}

export async function getKnowledgeIncidentById(id: string) {
  return prisma.knowledgeIncident.findUnique({ where: { id } });
}

export async function getKnowledgeLessons(filters: { domain?: string; limit?: number } = {}) {
  return prisma.knowledgeLesson.findMany({
    where: filters.domain ? { domain: filters.domain } : undefined,
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(filters.limit ?? 50, 1), 200),
  });
}

export async function getLatestIngestionRuns(limit = 10) {
  return prisma.knowledgeIngestionRun.findMany({
    orderBy: { startedAt: "desc" },
    take: Math.min(Math.max(limit, 1), 50),
  });
}

export async function getKnowledgeHealthFromDb() {
  const [
    persistedSources,
    ingestionRuns,
    incidents,
    documents,
    lessons,
    pendingReviews,
    domainGroups,
  ] = await Promise.all([
    prisma.knowledgeSource.count(),
    prisma.knowledgeIngestionRun.findMany({ orderBy: { startedAt: "desc" }, take: 8 }),
    prisma.knowledgeIncident.count(),
    prisma.knowledgeDocument.count(),
    prisma.knowledgeLesson.count(),
    prisma.knowledgeAdminReview.count({ where: { status: "pending" } }),
    prisma.knowledgeIncident.groupBy({ by: ["domain"], _count: { domain: true } }),
  ]);
  return {
    persistedSources,
    latestIngestionRuns: ingestionRuns,
    persistedIncidents: incidents,
    persistedDocuments: documents,
    persistedLessons: lessons,
    pendingReviews,
    incidentsByDomain: domainGroups.map((item) => ({ domain: item.domain, count: item._count.domain })),
  };
}
