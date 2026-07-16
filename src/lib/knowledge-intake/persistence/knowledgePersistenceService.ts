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

type WeatherContextEvidenceInput = {
  incidentId?: string;
  sourceIncidentId?: string;
  sourceId: "open-meteo" | "usgs-water" | "noaa-coops" | "ioc-slsmf" | "openaq" | "osm-overpass";
  sourceName: "Open-Meteo" | "USGS Water Data" | "NOAA CO-OPS" | "IOC Sea Level Monitoring Facility" | "OpenAQ" | "OpenStreetMap / Overpass";
  evidenceType: "weather_context" | "hydrological_context" | "coastal_ocean_context" | "sea_level_observation_context" | "air_quality_observation_context" | "critical_infrastructure_context";
  title: string;
  url?: string;
  excerpt: string;
  rawRef: string;
  confidenceScore: number;
  metadataJson: Prisma.InputJsonValue;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

/**
 * For genuinely-optional incident fields (e.g. `casualties`/`impact`, which
 * many sources never populate) — `undefined`/`null` must become
 * `Prisma.JsonNull`, not the plain JS `null` literal `toJson` above
 * produces. Prisma's client rejects a bare `null` for `Json?` columns at
 * runtime ("must not be null. Please use undefined instead."), which is
 * easy to hit for any adapter whose optional fields aren't always
 * populated (not specific to one source) — kept as a separate helper from
 * `toJson` so the many required-field call sites below don't all need a
 * wider, Prisma-null-aware return type.
 */
function toNullableJson(value: unknown): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (value === undefined || value === null) return Prisma.JsonNull;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
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
    geometryJson: toNullableJson(incident.geometry),
    casualtiesJson: toNullableJson(incident.casualties),
    impactJson: toNullableJson(incident.impact),
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
      officialSource: source.reliabilityScore.finalScore >= 90 || source.tags.includes("officialSource:true"),
      enabled: source.status === "active" || source.status === "active_contextual" || source.status === "active_historical" || source.status === "active_institutional",
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
      officialSource: source.reliabilityScore.finalScore >= 90 || source.tags.includes("officialSource:true"),
      enabled: source.status === "active" || source.status === "active_contextual" || source.status === "active_historical" || source.status === "active_institutional",
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
      evidenceType: evidence.sourceId === "openfema"
        ? "institutional_disaster_declaration"
        : evidence.sourceId === "noaa-storm-events"
          ? "historical_event_record"
          : evidence.sourceId === "noaa-ncei-tsunami"
            ? "tsunami_runup_observation"
          : "source_report",
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

export async function saveKnowledgeEvidenceIfNew(evidence: ArgusKnowledgeEvidenceItem) {
  const existing = await prisma.knowledgeEvidence.findFirst({
    where: {
      sourceId: evidence.sourceId,
      rawRef: evidence.id,
      ...(evidence.incidentId ? { incidentId: evidence.incidentId } : {}),
    },
  });
  if (existing) return { action: "skipped" as const, evidence: existing };
  return { action: "inserted" as const, evidence: await saveKnowledgeEvidence(evidence) };
}

export async function findKnowledgeIncidentBySourceIncidentId(sourceIncidentId: string) {
  return prisma.knowledgeIncident.findFirst({
    where: {
      OR: [
        { id: sourceIncidentId },
        { externalId: sourceIncidentId },
      ],
    },
  });
}

export async function findFreshWeatherContextEvidence(input: {
  incidentId: string;
  sourceId?: string;
  evidenceType?: "weather_context" | "hydrological_context" | "coastal_ocean_context" | "sea_level_observation_context" | "air_quality_observation_context" | "critical_infrastructure_context";
  ttlMinutes?: number;
}) {
  const createdAfter = new Date(Date.now() - (input.ttlMinutes ?? 60) * 60_000);
  return prisma.knowledgeEvidence.findFirst({
    where: {
      incidentId: input.incidentId,
      sourceId: input.sourceId ?? "open-meteo",
      evidenceType: input.evidenceType ?? "weather_context",
      createdAt: { gte: createdAfter },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function findFreshHydrologicalContextEvidence(input: {
  incidentId: string;
  sourceId?: string;
  ttlMinutes?: number;
}) {
  return findFreshWeatherContextEvidence({
    incidentId: input.incidentId,
    sourceId: input.sourceId ?? "usgs-water",
    evidenceType: "hydrological_context",
    ttlMinutes: input.ttlMinutes,
  });
}

export async function findFreshCoastalOceanContextEvidence(input: {
  incidentId: string;
  sourceId?: string;
  ttlMinutes?: number;
}) {
  return findFreshWeatherContextEvidence({
    incidentId: input.incidentId,
    sourceId: input.sourceId ?? "noaa-coops",
    evidenceType: "coastal_ocean_context",
    ttlMinutes: input.ttlMinutes,
  });
}

export async function findFreshSeaLevelObservationContextEvidence(input: {
  incidentId: string;
  sourceId?: string;
  ttlMinutes?: number;
}) {
  return findFreshWeatherContextEvidence({
    incidentId: input.incidentId,
    sourceId: input.sourceId ?? "ioc-slsmf",
    evidenceType: "sea_level_observation_context",
    ttlMinutes: input.ttlMinutes,
  });
}

export async function findFreshAirQualityObservationContextEvidence(input: {
  incidentId: string;
  sourceId?: string;
  ttlMinutes?: number;
}) {
  return findFreshWeatherContextEvidence({
    incidentId: input.incidentId,
    sourceId: input.sourceId ?? "openaq",
    evidenceType: "air_quality_observation_context",
    ttlMinutes: input.ttlMinutes,
  });
}

export async function findFreshCriticalInfrastructureContextEvidence(input: {
  incidentId: string;
  sourceId?: string;
  ttlMinutes?: number;
}) {
  return findFreshWeatherContextEvidence({
    incidentId: input.incidentId,
    sourceId: input.sourceId ?? "osm-overpass",
    evidenceType: "critical_infrastructure_context",
    ttlMinutes: input.ttlMinutes,
  });
}

export async function saveWeatherContextEvidenceIfFreshMissing(input: WeatherContextEvidenceInput, ttlMinutes = 60) {
  const resolvedIncidentId = input.incidentId ?? (
    input.sourceIncidentId ? (await findKnowledgeIncidentBySourceIncidentId(input.sourceIncidentId))?.id : undefined
  );
  if (!resolvedIncidentId) {
    if (input.evidenceType === "hydrological_context" || input.evidenceType === "coastal_ocean_context" || input.evidenceType === "sea_level_observation_context" || input.evidenceType === "air_quality_observation_context" || input.evidenceType === "critical_infrastructure_context") {
      const existing = await prisma.knowledgeEvidence.findFirst({
        where: {
          sourceId: input.sourceId,
          evidenceType: input.evidenceType,
          rawRef: input.rawRef,
        },
      });
      if (existing) {
        return {
          action: "skipped_fresh" as const,
          evidence: existing,
          incidentId: null,
        };
      }
      const evidence = await prisma.knowledgeEvidence.create({
        data: {
          sourceId: input.sourceId,
          sourceName: input.sourceName,
          evidenceType: input.evidenceType,
          title: input.title,
          url: input.url,
          excerpt: input.excerpt,
          rawRef: input.rawRef,
          confidenceScore: input.confidenceScore,
          metadataJson: input.metadataJson,
        },
      });
      return {
        action: "inserted" as const,
        evidence,
        incidentId: null,
      };
    }
    return {
      action: "skipped_no_association" as const,
      evidence: null,
      incidentId: null,
    };
  }
  const fresh = await findFreshWeatherContextEvidence({
      incidentId: resolvedIncidentId,
      sourceId: input.sourceId,
      evidenceType: input.evidenceType,
      ttlMinutes,
    });
  if (fresh) {
    return {
      action: "skipped_fresh" as const,
      evidence: fresh,
      incidentId: resolvedIncidentId,
    };
  }
  const evidence = await prisma.knowledgeEvidence.create({
    data: {
      incidentId: resolvedIncidentId,
      sourceId: input.sourceId,
      sourceName: input.sourceName,
      evidenceType: input.evidenceType,
      title: input.title,
      url: input.url,
      excerpt: input.excerpt,
      rawRef: input.rawRef,
      confidenceScore: input.confidenceScore,
      metadataJson: input.metadataJson,
    },
  });
  return {
    action: "inserted" as const,
    evidence,
    incidentId: resolvedIncidentId,
  };
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

/**
 * ARGUS Prompt 15 — preselección acotada de incidentes de incendio ya
 * persistidos, candidatos a correlación cross-corrida (un incendio visto por
 * EFFIS hace 3 días y por un nuevo cluster FIRMS en esta corrida). Nunca
 * carga el historial completo: filtra por dominio wildfire, una ventana
 * temporal (`sinceIso`, el máximo de las reglas de `wildfireCorrelationPolicy`
 * es 240h) y un bbox generoso de 1° (~110 km) alrededor del centroide —el
 * bbox es solo preselección (Prompt 15 §10); la decisión real de fusión la
 * toma `evaluateWildfireCorrelation` con geometría/distancia exacta sobre
 * cada candidato devuelto aquí. `take` acota el costo por corrida.
 */
export async function findWildfireCorrelationCandidates(input: {
  centroid: { lat: number; lng: number };
  sinceIso: string;
  country?: string | null;
  limit?: number;
}) {
  const BBOX_MARGIN_DEGREES = 1;
  return prisma.knowledgeIncident.findMany({
    where: {
      domain: "wildfire",
      updatedAt: { gte: new Date(input.sinceIso) },
      latitude: { gte: input.centroid.lat - BBOX_MARGIN_DEGREES, lte: input.centroid.lat + BBOX_MARGIN_DEGREES },
      longitude: { gte: input.centroid.lng - BBOX_MARGIN_DEGREES, lte: input.centroid.lng + BBOX_MARGIN_DEGREES },
      ...(input.country ? { country: input.country } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: Math.min(Math.max(input.limit ?? 20, 1), 50),
  });
}

/**
 * Adjunta evidencia de una fuente adicional a un `KnowledgeIncident` de
 * incendio ya persistido (encontrado por `findWildfireCorrelationCandidates`
 * + `evaluateWildfireCorrelation`), sin crear una fila nueva — preserva la
 * identidad canónica del incidente (Prompt 15 §13). Solo actualiza
 * severidad/confianza/evidenceCount cuando la nueva señal realmente los
 * supera (nunca degrada un valor existente), igual que
 * `shouldUpdateExistingIncident` para el resto del pipeline.
 */
export async function attachWildfireEvidenceToExistingIncident(
  existingId: string,
  incoming: ArgusIncidentKnowledge
) {
  const existing = await prisma.knowledgeIncident.findUnique({ where: { id: existingId } });
  if (!existing) return null;

  const severityRank: Record<string, number> = { unknown: 0, low: 1, medium: 2, high: 3, critical: 4 };
  const shouldRaiseSeverity = (severityRank[incoming.severity] ?? 0) > (severityRank[existing.severity] ?? 0);
  const shouldRaiseConfidence = incoming.confidenceScore > existing.confidenceScore;

  const updated = shouldRaiseSeverity || shouldRaiseConfidence
    ? await prisma.knowledgeIncident.update({
        where: { id: existingId },
        data: {
          ...(shouldRaiseSeverity ? { severity: incoming.severity } : {}),
          ...(shouldRaiseConfidence ? { confidenceScore: incoming.confidenceScore } : {}),
        },
      })
    : existing;

  return { incident: updated, severityRaised: shouldRaiseSeverity };
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

/**
 * ARGUS Prompt 16 — ventana acotada de corridas recientes, agrupadas por
 * `sourceId`, para calcular salud dinámica (últimas N por fuente: éxito,
 * fallos consecutivos, duración). `KnowledgeIngestionRun.sourceId` ya es una
 * columna libre usada genéricamente por cualquier fuente (Global Watch,
 * Chile Alerts, o cualquier job manual de knowledge-intake que llame
 * `createIngestionRun`/`finishIngestionRun`) — no requiere cambio de
 * esquema. Una sola consulta acotada (`take: windowSize`), nunca una por
 * fuente, y nunca sin filtro de `sourceId` (Prompt 16 §23/§27).
 */
export async function getRecentIngestionRunsBySource(sourceIds: string[], windowSize = 400) {
  const map = new Map<string, Awaited<ReturnType<typeof prisma.knowledgeIngestionRun.findMany>>>();
  if (sourceIds.length === 0) return map;
  const rows = await prisma.knowledgeIngestionRun.findMany({
    where: { sourceId: { in: sourceIds } },
    orderBy: { startedAt: "desc" },
    take: Math.min(Math.max(windowSize, 1), 1000),
  });
  for (const row of rows) {
    const list = map.get(row.sourceId) ?? [];
    list.push(row);
    map.set(row.sourceId, list);
  }
  return map;
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
