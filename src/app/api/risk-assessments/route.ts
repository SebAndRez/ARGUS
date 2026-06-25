import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { seedChileHazardSourceRegistry } from "@/lib/knowledge/seedHazardKnowledge";
import { generateRiskAssessments, riskAssessmentToJson } from "@/lib/prediction/riskEngine";
import type {
  ArgusExternalSourceId,
  ArgusIngestionCategory,
  ArgusIngestionSeverity,
  ArgusNormalizedEvent,
} from "@/types/ingestion";
import type {
  HazardKnowledgeDocumentSummary,
  HazardKnowledgeFact,
} from "@/types/hazardKnowledge";
import type { ArgusRiskAssessment } from "@/types/riskAssessment";

export const dynamic = "force-dynamic";

function parseLimit(value: string | null) {
  const limit = Number(value ?? "30");
  return Number.isInteger(limit) ? Math.min(100, Math.max(1, limit)) : 30;
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function jsonObject(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function dateIso(value: Date | null | undefined) {
  return value?.toISOString() ?? new Date().toISOString();
}

function normalizePersistedEvent(event: {
  id: string;
  sourceId: string;
  externalId: string;
  category: string;
  title: string;
  description: string | null;
  severity: string | null;
  confidence: number | null;
  latitude: number | null;
  longitude: number | null;
  locationName: string | null;
  country: string | null;
  sourceUrl: string | null;
  occurredAt: Date | null;
  normalized: Prisma.JsonValue | null;
}): ArgusNormalizedEvent {
  const normalized = jsonObject(event.normalized);

  return {
    id: String(normalized.id ?? event.id),
    sourceId: event.sourceId as ArgusExternalSourceId,
    sourceName: String(normalized.sourceName ?? event.sourceId),
    externalId: event.externalId,
    title: event.title,
    description: event.description ?? "",
    category: event.category as ArgusIngestionCategory,
    severity: (event.severity ?? "medium") as ArgusIngestionSeverity,
    confidence: event.confidence ?? 60,
    latitude: event.latitude,
    longitude: event.longitude,
    occurredAt: dateIso(event.occurredAt),
    updatedAt: typeof normalized.updatedAt === "string" ? normalized.updatedAt : null,
    url: event.sourceUrl,
    rawMagnitude:
      typeof normalized.rawMagnitude === "number" ? normalized.rawMagnitude : null,
    rawMagnitudeType:
      typeof normalized.rawMagnitudeType === "string"
        ? normalized.rawMagnitudeType
        : null,
    rawDepthKm:
      typeof normalized.rawDepthKm === "number" ? normalized.rawDepthKm : null,
    rawOfficialMmi:
      typeof normalized.rawOfficialMmi === "number"
        ? normalized.rawOfficialMmi
        : null,
    rawAlertLevel:
      typeof normalized.rawAlertLevel === "string"
        ? (normalized.rawAlertLevel as ArgusNormalizedEvent["rawAlertLevel"])
        : null,
    rawMessageType:
      typeof normalized.rawMessageType === "string"
        ? normalized.rawMessageType
        : null,
    rawConfidence:
      typeof normalized.rawConfidence === "string"
        ? normalized.rawConfidence
        : null,
    rawFrp: typeof normalized.rawFrp === "number" ? normalized.rawFrp : null,
    rawBrightness:
      typeof normalized.rawBrightness === "number"
        ? normalized.rawBrightness
        : null,
    satellite:
      typeof normalized.satellite === "string" ? normalized.satellite : null,
    instrument:
      typeof normalized.instrument === "string" ? normalized.instrument : null,
    dayNight: typeof normalized.dayNight === "string" ? normalized.dayNight : null,
    locationName: event.locationName,
    country: event.country,
    recommendedAction:
      typeof normalized.recommendedAction === "string"
        ? normalized.recommendedAction
        : null,
    whyItMatters:
      typeof normalized.whyItMatters === "string"
        ? normalized.whyItMatters
        : null,
    isExternal: true,
  };
}

function mapFact(fact: {
  id: string;
  hazardType: string;
  knowledgeType: string;
  title: string;
  summary: string;
  country: string | null;
  region: string | null;
  latitude: number | null;
  longitude: number | null;
  year: number | null;
  eventDate: Date | null;
  magnitude: number | null;
  magnitudeLabel: string | null;
  depthKm: number | null;
  ruptureLengthKm: number | null;
  maxSeaLevelVariationM: number | null;
  affectedCoastKm: number | null;
  casualtiesText: string | null;
  sourceName: string;
  sourceUrl: string;
  confidence: number;
  tags: Prisma.JsonValue | null;
  documentId: string | null;
  documentCategory: string | null;
  extractionStatus: string | null;
  limitationNote: string | null;
  relevanceScore: number | null;
}): HazardKnowledgeFact {
  return {
    id: fact.id,
    hazardType: fact.hazardType as HazardKnowledgeFact["hazardType"],
    knowledgeType: fact.knowledgeType as HazardKnowledgeFact["knowledgeType"],
    title: fact.title,
    summary: fact.summary,
    country: fact.country ?? undefined,
    region: fact.region ?? undefined,
    latitude: fact.latitude ?? undefined,
    longitude: fact.longitude ?? undefined,
    year: fact.year ?? undefined,
    eventDate: fact.eventDate?.toISOString(),
    magnitude: fact.magnitude ?? undefined,
    magnitudeLabel: fact.magnitudeLabel ?? undefined,
    depthKm: fact.depthKm ?? undefined,
    ruptureLengthKm: fact.ruptureLengthKm ?? undefined,
    maxSeaLevelVariationM: fact.maxSeaLevelVariationM ?? undefined,
    affectedCoastKm: fact.affectedCoastKm ?? undefined,
    casualtiesText: fact.casualtiesText ?? undefined,
    sourceName: fact.sourceName,
    sourceUrl: fact.sourceUrl,
    confidence: fact.confidence,
    tags: Array.isArray(fact.tags) ? fact.tags.map(String) : [],
    documentId: fact.documentId ?? undefined,
    documentCategory: fact.documentCategory ?? undefined,
    extractionStatus: fact.extractionStatus ?? undefined,
    limitationNote: fact.limitationNote ?? undefined,
    relevanceScore: fact.relevanceScore ?? undefined,
  };
}

function mapDocument(document: {
  id: string;
  title: string;
  sourceName: string;
  sourceUrl: string;
  publisher: string | null;
  country: string | null;
  hazardType: string;
  language: string | null;
  publishedYear: number | null;
  notes: string | null;
  documentCategory: string | null;
  ingestionStatus: string | null;
  priority: number | null;
  reliabilityScore: number | null;
  institution: string | null;
  countryFocus: string | null;
  regionFocus: string | null;
  hazardTypes: Prisma.JsonValue | null;
  tags: Prisma.JsonValue | null;
  limitationNote: string | null;
}): HazardKnowledgeDocumentSummary {
  return {
    id: document.id,
    title: document.title,
    sourceName: document.sourceName,
    sourceUrl: document.sourceUrl,
    publisher: document.publisher ?? undefined,
    country: document.country ?? undefined,
    hazardType: document.hazardType,
    language: document.language ?? undefined,
    publishedYear: document.publishedYear ?? undefined,
    notes: document.notes ?? undefined,
    documentCategory: document.documentCategory ?? undefined,
    ingestionStatus: document.ingestionStatus ?? undefined,
    priority: document.priority ?? undefined,
    reliabilityScore: document.reliabilityScore ?? undefined,
    institution: document.institution ?? undefined,
    countryFocus: document.countryFocus ?? undefined,
    regionFocus: document.regionFocus ?? undefined,
    hazardTypes: Array.isArray(document.hazardTypes)
      ? document.hazardTypes.map(String)
      : undefined,
    tags: Array.isArray(document.tags) ? document.tags.map(String) : undefined,
    limitationNote: document.limitationNote ?? undefined,
  };
}

async function persistAssessment(assessment: ArgusRiskAssessment) {
  const previous = await prisma.riskAssessment.findUnique({
    where: { id: assessment.id },
  });
  const data = {
    riskType: assessment.riskType,
    status: assessment.status,
    probabilityBand: assessment.probabilityBand,
    probabilityScore: assessment.probabilityScore,
    confidence: assessment.confidence,
    severity: assessment.severity,
    title: assessment.title,
    summary: assessment.summary,
    recommendedAction: assessment.recommendedAction,
    timeframe: assessment.timeframe,
    relatedExternalEventIds: asJson(assessment.relatedExternalEventIds),
    evidence: asJson(assessment.evidence),
    nextReviewAt: assessment.nextReviewAt
      ? new Date(assessment.nextReviewAt)
      : undefined,
    metadata: riskAssessmentToJson({
      ...assessment,
      evidence: [],
      relatedExternalEventIds: [],
    }),
  };

  await prisma.riskAssessment.upsert({
    where: { id: assessment.id },
    create: {
      id: assessment.id,
      ...data,
    },
    update: data,
  });

  if (
    !previous ||
    previous.status !== assessment.status ||
    previous.probabilityScore !== assessment.probabilityScore
  ) {
    await prisma.riskAssessmentRevision.create({
      data: {
        assessmentId: assessment.id,
        previousStatus: previous?.status,
        newStatus: assessment.status,
        previousProbabilityScore: previous?.probabilityScore,
        newProbabilityScore: assessment.probabilityScore,
        reason: previous
          ? "Assessment actualizado por nueva evaluacion determinista."
          : "Assessment creado por motor predictivo ARGUS.",
        evidence: asJson(assessment.evidence),
      },
    });
  }
}

export async function GET(request: NextRequest) {
  await seedChileHazardSourceRegistry();

  const riskType = request.nextUrl.searchParams.get("riskType")?.trim();
  const sourceId = request.nextUrl.searchParams.get("sourceId")?.trim();
  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));

  const dbEvents = await prisma.externalEvent.findMany({
    where: {
      ...(sourceId ? { sourceId } : {}),
    },
    orderBy: [{ occurredAt: "desc" }, { updatedAt: "desc" }],
    take: limit,
  });
  const facts = await prisma.hazardKnowledgeFact.findMany({
    orderBy: [{ relevanceScore: "desc" }, { confidence: "desc" }],
    take: 80,
  });
  const documents = await prisma.hazardKnowledgeDocument.findMany({
    orderBy: [{ priority: "asc" }, { reliabilityScore: "desc" }],
    take: 60,
  });

  const externalEvents = dbEvents.map(normalizePersistedEvent);
  const assessments = generateRiskAssessments({
    externalEvents,
    historicalFacts: facts.map(mapFact),
    historicalDocuments: documents.map(mapDocument),
  }).filter((assessment) => (riskType ? assessment.riskType === riskType : true));

  await Promise.all(assessments.map(persistAssessment));

  return NextResponse.json({
    count: assessments.length,
    assessments,
  });
}
