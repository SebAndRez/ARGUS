import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/services/authService";
import { hasAnyRole } from "@/lib/security/rbac";
import { OPERATOR_ROLES } from "@/lib/security/apiGuards";
import { enforceRateLimit, rateLimitResponseForOutcome } from "@/lib/security/rateLimit";
import { generateRiskAssessments, riskAssessmentToJson } from "@/lib/prediction/riskEngine";
import { calculateArgusConfidenceFromEvidence } from "@/lib/prediction/confirmationScoring";
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
import type { ArgusRiskEvidence } from "@/types/riskAssessment";

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

function jsonArray(value: Prisma.JsonValue | null): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * `metadata` se escribe como `riskAssessmentToJson({ ...assessment, ... })`
 * (ver `persistAssessment`) — es decir, contiene una copia completa del
 * assessment, no solo `historicalContext`. Pero todos los demas campos de
 * `ArgusRiskAssessment` ya vienen de columnas propias de la tabla (ver el
 * literal de retorno de `mapStoredAssessment`), asi que la unica razon real
 * para leer `metadata` es recuperar `historicalContext`, que no tiene
 * columna dedicada. Extraccion explicita con validacion de forma — nunca un
 * spread del objeto completo, que dejaria pasar cualquier clave presente en
 * `metadata` sin querer.
 */
function extractHistoricalContext(metadata: Record<string, unknown>): ArgusRiskAssessment["historicalContext"] {
  const candidate = metadata.historicalContext;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return undefined;
  const { explanation, facts, documents } = candidate as Record<string, unknown>;
  if (typeof explanation !== "string" || !Array.isArray(facts) || !Array.isArray(documents)) return undefined;
  return {
    explanation,
    facts: facts as HazardKnowledgeFact[],
    documents: documents as HazardKnowledgeDocumentSummary[],
  };
}

function mapStoredAssessment(assessment: {
  id: string;
  riskType: string;
  status: string;
  probabilityBand: string;
  probabilityScore: number;
  confidence: number;
  severity: string;
  title: string;
  summary: string;
  recommendedAction: string;
  timeframe: string | null;
  relatedExternalEventIds: Prisma.JsonValue;
  evidence: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
  nextReviewAt: Date | null;
  metadata: Prisma.JsonValue | null;
}): ArgusRiskAssessment {
  const metadata = jsonObject(assessment.metadata);

  return {
    historicalContext: extractHistoricalContext(metadata),
    id: assessment.id,
    riskType: assessment.riskType as ArgusRiskAssessment["riskType"],
    status: assessment.status as ArgusRiskAssessment["status"],
    probabilityBand:
      assessment.probabilityBand as ArgusRiskAssessment["probabilityBand"],
    probabilityScore: assessment.probabilityScore,
    confidence: assessment.confidence,
    severity: assessment.severity,
    title: assessment.title,
    summary: assessment.summary,
    recommendedAction: assessment.recommendedAction,
    timeframe: assessment.timeframe ?? "",
    relatedExternalEventIds: jsonArray(assessment.relatedExternalEventIds).map(String),
    evidence: jsonArray(assessment.evidence) as ArgusRiskAssessment["evidence"],
    createdAt: assessment.createdAt.toISOString(),
    updatedAt: assessment.updatedAt.toISOString(),
    nextReviewAt: assessment.nextReviewAt?.toISOString(),
  };
}

function assessmentMatchesQuery(
  assessment: ArgusRiskAssessment,
  query: {
    externalEventId?: string;
    relatedExternalEventId?: string;
    externalId?: string;
    reportId?: string;
    sourceId?: string;
    riskType?: string;
  }
) {
  if (query.riskType && assessment.riskType !== query.riskType) return false;

  const relatedIds = new Set(assessment.relatedExternalEventIds);
  const targetIds = [
    query.externalEventId,
    query.relatedExternalEventId,
    query.externalId,
    query.reportId,
  ].filter(Boolean) as string[];

  if (targetIds.length > 0 && !targetIds.some((id) => relatedIds.has(id))) {
    return false;
  }

  if (
    query.sourceId &&
    !assessment.evidence.some((evidence) => evidence.sourceId === query.sourceId)
  ) {
    return false;
  }

  return true;
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

function reportRiskType(category: string): ArgusRiskAssessment["riskType"] {
  const normalized = category.toLowerCase();
  if (normalized.includes("fire") || normalized.includes("incendio")) return "fire_smoke";
  if (normalized.includes("earthquake") || normalized.includes("sismo")) {
    return "earthquake_impact";
  }
  if (normalized.includes("tsunami")) return "tsunami";
  return "general_escalation";
}

/**
 * `report.title` is free text the citizen typed — `incidentDto.ts` (used by
 * `GET /api/reports`/`GET /api/events`) explicitly never exposes it to
 * non-operator callers ("pueden contener direcciones o nombres"). This
 * endpoint has no session gating at all today, so it must apply the same
 * redaction: `canViewFull` (OPERATOR+) gets the real title, everyone else
 * gets a category-based title, matching `toPublicReportMapEvent`.
 */
function createCitizenReportAssessment(
  report: {
    id: string;
    title: string;
    category: string;
    severity: string;
    createdAt: Date;
    updatedAt: Date;
  },
  canViewFull: boolean
): ArgusRiskAssessment {
  const evidence: ArgusRiskEvidence[] = [
    {
      id: `citizen_report:${report.id}`,
      sourceId: "citizen_report",
      sourceName: "Reporte ciudadano",
      externalEventId: report.id,
      kind: "citizen_report",
      weight: 24,
      finding:
        "Reporte ciudadano en verificacion. Requiere confirmacion adicional.",
      observedAt: report.createdAt.toISOString(),
    },
  ];
  const confirmation = calculateArgusConfidenceFromEvidence(evidence);

  return {
    id: `argus-report-verification-${report.id}`,
    riskType: reportRiskType(report.category),
    status: confirmation.status,
    probabilityBand: confirmation.probabilityBand,
    probabilityScore: Math.min(45, confirmation.confidence),
    confidence: Math.min(45, confirmation.confidence),
    severity: report.severity.toLowerCase(),
    title: canViewFull
      ? `Verificacion ARGUS: ${report.title}`
      : `Verificacion ARGUS: reporte ciudadano (${report.category})`,
    summary:
      "Hipotesis inicial basada en reporte ciudadano. No es confirmacion exacta y requiere fuentes adicionales.",
    recommendedAction:
      "Contrastar con fuentes oficiales, camaras asociadas o reportes independientes cercanos antes de elevar prioridad.",
    timeframe: "corto plazo",
    evidence,
    relatedExternalEventIds: [report.id],
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
  };
}

function createExternalEventSourceAssessment(
  event: ArgusNormalizedEvent
): ArgusRiskAssessment {
  const evidence: ArgusRiskEvidence[] = [
    {
      id: `${event.sourceId}:${event.id}:primary`,
      sourceId: event.sourceId,
      sourceName: event.sourceName,
      externalEventId: event.id,
      kind: event.category,
      weight: 48,
      finding: event.whyItMatters ?? "Fuente tecnica primaria detectada.",
      observedAt: event.occurredAt,
      url: event.url ?? undefined,
    },
  ];
  const confirmation = calculateArgusConfidenceFromEvidence(evidence);
  const riskType =
    event.category === "earthquake"
      ? "earthquake_impact"
      : event.category === "tsunami"
        ? "tsunami"
        : event.category === "wildfire"
          ? "fire_smoke"
          : "general_escalation";

  return {
    id: `argus-external-source-${event.id}`,
    riskType,
    status: confirmation.status,
    probabilityBand: confirmation.probabilityBand,
    probabilityScore: confirmation.confidence,
    confidence: confirmation.confidence,
    severity: event.severity,
    title: `Analisis ARGUS: ${event.title}`,
    summary:
      "Fuente tecnica u oficial detectada. ARGUS genera una hipotesis con mayor confianza, pero sigue siendo estimacion.",
    recommendedAction:
      event.recommendedAction ??
      "Revisar actualizaciones oficiales y mantener seguimiento operacional.",
    timeframe: "vigente mientras la fuente este activa",
    evidence,
    relatedExternalEventIds: [event.id, event.externalId].filter(Boolean),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  const canViewFull = hasAnyRole(user, OPERATOR_ROLES);

  // Same policy as GET /api/reports, GET /api/help-requests, GET /api/events
  // and GET /api/notifications (PRIV-FINAL-001 §16): this route can surface
  // citizen-report-derived content, so anonymous callers get the same rate
  // limit as those siblings — authenticated operators never do.
  if (!user) {
    const outcome = await enforceRateLimit({ policy: "public_incident_read", request });
    const blocked = rateLimitResponseForOutcome(outcome);
    if (blocked) return blocked;
  }

  const riskType = request.nextUrl.searchParams.get("riskType")?.trim();
  const sourceId = request.nextUrl.searchParams.get("sourceId")?.trim();
  const externalEventId = request.nextUrl.searchParams
    .get("externalEventId")
    ?.trim();
  const relatedExternalEventId = request.nextUrl.searchParams
    .get("relatedExternalEventId")
    ?.trim();
  const externalId = request.nextUrl.searchParams.get("externalId")?.trim();
  const reportId = request.nextUrl.searchParams.get("reportId")?.trim();
  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
  const isEventSpecificQuery = Boolean(
    externalEventId || relatedExternalEventId || externalId || reportId
  );

  if (isEventSpecificQuery) {
    const storedAssessments = await prisma.riskAssessment.findMany({
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: Math.max(50, limit),
    });
    const assessments = storedAssessments
      .map(mapStoredAssessment)
      .filter((assessment) =>
        assessmentMatchesQuery(assessment, {
          externalEventId,
          relatedExternalEventId,
          externalId,
          reportId,
          sourceId,
          riskType,
        })
      )
      .slice(0, limit);

    if (assessments.length > 0) {
      return NextResponse.json({
        count: assessments.length,
        assessments,
      });
    }

    if (reportId) {
      const report = await prisma.report.findUnique({
        where: { id: reportId },
        select: { id: true, title: true, category: true, severity: true, createdAt: true, updatedAt: true },
      });
      const fallbackAssessment = report
        ? createCitizenReportAssessment(report, canViewFull)
        : createCitizenReportAssessment(
            {
              id: reportId,
              title: "Reporte ciudadano demo",
              category: "general",
              severity: "LOW",
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            canViewFull
          );

      return NextResponse.json({
        count: 1,
        assessments: [fallbackAssessment],
      });
    }

    const externalLookupId = externalEventId ?? relatedExternalEventId ?? externalId;
    if (externalLookupId) {
      const storedEvent = await prisma.externalEvent.findFirst({
        where: {
          OR: [{ id: externalLookupId }, { externalId: externalLookupId }],
          ...(sourceId ? { sourceId } : {}),
        },
      });

      if (storedEvent) {
        const event = normalizePersistedEvent(storedEvent);
        const generated = generateRiskAssessments({ externalEvents: [event] });
        const fallbackAssessment =
          generated[0] ?? createExternalEventSourceAssessment(event);

        return NextResponse.json({
          count: 1,
          assessments: [fallbackAssessment],
        });
      }
    }

    return NextResponse.json({
      count: 0,
      assessments: [],
    });
  }

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
