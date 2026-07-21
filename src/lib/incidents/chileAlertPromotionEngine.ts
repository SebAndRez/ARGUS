import {
  classifyThreat,
  classifySeverityFromLevel,
  mapThreatToHazardDomain,
  type SevereWeatherThreatType,
} from "@/lib/weather/severeWeatherClassifier";
import { resolveAdministrativeAreaWithFallback } from "@/lib/geometry/argusGeometryResolver";
import { extractDmcMentionEvidence } from "@/lib/sources/chile/dmcProvider";
import type { ChileOfficialAlertRaw } from "@/lib/sources/chile/senapredProvider";
import {
  createIngestionRun,
  finishIngestionRun,
  saveKnowledgeEvidenceIfNew,
  upsertKnowledgeIncidentByExternalId,
} from "@/lib/knowledge-intake/persistence/knowledgePersistenceService";
import type { ArgusEvidenceConfidenceScore, ArgusIncidentKnowledge } from "@/types/knowledgeIntake";

/**
 * Promotes classified Chile official alerts (severity `high`/`critical`
 * only) into persisted `KnowledgeIncident` + `KnowledgeEvidence` rows,
 * reusing the *existing* dedup-aware persistence service untouched
 * (`upsertKnowledgeIncidentByExternalId`, `saveKnowledgeEvidenceIfNew`) — no
 * new dedup logic. `incident.id` doubles as the DB `externalId` (see
 * `getExternalIdFromIncident` in `knowledgeDeduplication.ts`: any
 * `sourceIds[0]` not in its known-prefix list falls through to using
 * `incident.id` verbatim), so re-running ingestion for the same
 * threat+area+day updates the same row instead of duplicating it.
 */
const SOURCE_ID = "senapred_eventos";
const SOURCE_NAME = "SENAPRED";

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildExternalId(threat: SevereWeatherThreatType, areaName: string, issuedAt: string): string {
  const date = issuedAt.slice(0, 10);
  return `${threat.toLowerCase()}:${slugify(areaName)}:${date}`;
}

function chileAlertLifecycle(raw: ChileOfficialAlertRaw) {
  const text = `${raw.title} ${raw.levelText} ${raw.threatText} ${raw.contenido ?? ""}`.toLowerCase();
  if (/\b(cancel|cancela|cancelacion|finaliza|finalizada|levanta|levantamiento)\b/.test(text)) {
    return { lifecycle: "resolved", tag: "lifecycle:cancelled" };
  }
  if (/\b(modifica|modificacion|actualiza|actualizacion|amplia|ampliacion)\b/.test(text)) {
    return { lifecycle: "monitoring", tag: "lifecycle:modified" };
  }
  if (/\b(mantiene|vigente|monitoreo|monitoreando)\b/.test(text)) {
    return { lifecycle: "monitoring", tag: "lifecycle:maintained" };
  }
  if (/\b(declara|declaracion)\b/.test(text)) {
    return { lifecycle: "active", tag: "lifecycle:declared" };
  }
  return { lifecycle: "active", tag: "lifecycle:active" };
}

const RECOMMENDED_ACTIONS: Record<SevereWeatherThreatType, string> = {
  TORNADO: "Buscar refugio en un lugar bajo y firme, alejarse de ventanas y estructuras livianas, seguir instrucciones de SENAPRED.",
  WATERSPOUT: "Alejarse de la costa y de embarcaciones menores, no acercarse a observar el fenómeno.",
  SEVERE_WIND: "Asegurar objetos sueltos, evitar estructuras livianas y árboles, evitar desplazamientos innecesarios.",
  THUNDERSTORM: "Evitar espacios abiertos y estructuras metálicas, desconectar equipos eléctricos sensibles.",
  HEAVY_RAIN: "Evitar desplazamientos innecesarios, monitorear rutas y cortes, evitar cruces de cauces crecidos.",
  LANDSLIDE_RISK: "Evitar laderas, quebradas y taludes; no cruzar zonas con barro activo; reportar cortes o material sobre caminos.",
  FLOOD: "Evitar sectores anegados y cruces de cauces crecidos; priorizar rutas alternativas.",
  OTHER: "Revisar canales oficiales de SENAPRED y DMC antes de tomar decisiones operativas.",
};

function buildEvidenceConfidence(finalConfidence: number, label: ArgusEvidenceConfidenceScore["label"]): ArgusEvidenceConfidenceScore {
  return {
    sourceReliability: finalConfidence,
    corroborationCount: 1,
    geolocationPrecision: finalConfidence,
    timestampPrecision: 85,
    documentQuality: 80,
    extractionConfidence: 80,
    conflictWithOtherSources: 0,
    finalConfidence,
    label,
  };
}

export type ChileAlertPromotionSummary = {
  status: "success" | "partial" | "failed";
  runId: string | null;
  inserted: number;
  updated: number;
  skipped: number;
  notPromoted: number;
  incidents: ArgusIncidentKnowledge[];
  errors: string[];
};

export async function promoteChileOfficialAlerts(rawAlerts: ChileOfficialAlertRaw[]): Promise<ChileAlertPromotionSummary> {
  let run: Awaited<ReturnType<typeof createIngestionRun>>;
  try {
    run = await createIngestionRun({
      sourceId: SOURCE_ID,
      sourceName: SOURCE_NAME,
      metadataJson: { alertsConsidered: rawAlerts.length },
    });
  } catch (error) {
    return {
      status: "failed",
      runId: null,
      inserted: 0,
      updated: 0,
      skipped: 0,
      notPromoted: 0,
      incidents: [],
      errors: [error instanceof Error ? error.message : "Failed to create ingestion run"],
    };
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let notPromoted = 0;
  const errors: string[] = [];
  const incidents: ArgusIncidentKnowledge[] = [];

  // Pass 1 (sync, cheap): classify + filter to what's actually promotable.
  // Severity filtering never touches the DB, so it stays a plain loop.
  type PromotableAlert = { raw: ChileOfficialAlertRaw; threat: SevereWeatherThreatType; severity: "high" | "critical" };
  const promotable: PromotableAlert[] = [];
  for (const raw of rawAlerts) {
    const threat = classifyThreat(raw.threatText);
    const severity = classifySeverityFromLevel(raw.levelText);
    if (severity !== "high" && severity !== "critical") {
      notPromoted += 1;
      continue;
    }
    promotable.push({ raw, threat, severity });
  }

  // Pass 2 (DB, bounded concurrency): previously a plain `for` loop awaiting
  // one upsert + evidence save at a time — confirmed contributor to the
  // Global Watch 300s timeout during an active-alert period (many high/
  // critical alerts). `PROMOTION_PERSIST_CONCURRENCY` workers pull from a
  // shared queue instead, same idiom `globalWatchEngine.ts` already uses for
  // its own persistence step (`PERSIST_CONCURRENCY`). Counter mutations
  // below are safe under this pattern: JS has no true parallelism, so each
  // `+=` still runs to completion between await points, never interleaved
  // mid-update.
  const PROMOTION_PERSIST_CONCURRENCY = 6;
  const queue = [...promotable];
  const persistOne = async ({ raw, threat, severity }: PromotableAlert) => {
    const areaName = raw.commune ?? raw.province ?? raw.region ?? "chile";
    const geometryResolved = resolveAdministrativeAreaWithFallback("CL", {
      commune: raw.commune,
      province: raw.province,
      region: raw.region,
    });
    const externalId = buildExternalId(threat, areaName, raw.issuedAt);
    const domain = mapThreatToHazardDomain(threat);
    const lifecycle = chileAlertLifecycle(raw);

    const incident: ArgusIncidentKnowledge = {
      id: externalId,
      title: raw.title,
      summary: raw.threatText.slice(0, 900),
      domain,
      subtype: threat.toLowerCase(),
      severity,
      confidenceScore: 90,
      actionabilityScore: severity === "critical" ? 90 : 75,
      sourceReliabilityScore: 95,
      evidenceCount: 1,
      sourceIds: [SOURCE_ID],
      sourceNames: [SOURCE_NAME],
      occurredAt: raw.issuedAt,
      detectedAt: raw.updatedAt,
      country: "CL",
      region: raw.region,
      locality: raw.commune ?? raw.province,
      latitude: geometryResolved?.anchor[0],
      longitude: geometryResolved?.anchor[1],
      geometry: geometryResolved
        ? {
            type: "administrative_area",
            geojson: geometryResolved.geojson,
            regionNames: geometryResolved.regionNames,
            anchor: geometryResolved.anchor,
            precisionLevel: geometryResolved.resolvedLevel,
          }
        : undefined,
      // `ArgusIncidentTechnicalFactors` models physical-incident factors (fire
      // behavior, vehicle type, ...) that don't have a severe-weather-alert
      // equivalent; this is still stored as-is in the `technicalFactorsJson`
      // Json column, so the extra fields survive for
      // `canonicalKnowledgeIncidentToArgusEvent` to read back.
      technicalFactors: {
        threatType: threat,
        levelText: raw.levelText,
        region: raw.region,
        province: raw.province,
        commune: raw.commune,
        lifecycle: lifecycle.lifecycle,
      } as unknown as ArgusIncidentKnowledge["technicalFactors"],
      causes: [raw.levelText],
      contributingFactors: [],
      responseActions: [],
      lessonsLearned: [],
      recommendedActions: [
        {
          id: `rec-${externalId}`,
          audience: "citizen",
          priority: severity === "critical" ? "critical" : "high",
          text: RECOMMENDED_ACTIONS[threat],
          rationale: "Alerta oficial SENAPRED.",
          confidenceScore: 90,
          safetyLimit: "Estimación informativa ARGUS; seguir siempre instrucciones oficiales de SENAPRED/DMC.",
          requiresHumanValidation: false,
        },
      ],
      relatedHistoricalEvents: [],
      similarIncidentIds: [],
      tags: ["senapred", threat.toLowerCase(), slugify(raw.levelText), lifecycle.tag],
      language: "es",
      rawEvidenceRefs: raw.evidenceUrl ? [raw.evidenceUrl] : [],
      createdAt: raw.issuedAt,
      updatedAt: raw.updatedAt,
    };

    try {
      const saved = await upsertKnowledgeIncidentByExternalId(incident);
      if (saved.action === "inserted") inserted += 1;
      if (saved.action === "updated") updated += 1;
      if (saved.action === "skipped") skipped += 1;
      incidents.push(incident);

      await saveKnowledgeEvidenceIfNew({
        id: `evidence-${externalId}-senapred`,
        incidentId: saved.incident.id,
        sourceId: SOURCE_ID,
        sourceName: SOURCE_NAME,
        title: raw.title,
        url: raw.evidenceUrl,
        summary: raw.threatText.slice(0, 500),
        confidenceScore: buildEvidenceConfidence(90, "high"),
        locationConfidence: geometryResolved ? 90 : 40,
        timestampConfidence: 85,
        extractedAt: new Date().toISOString(),
      });

      const dmcMention = extractDmcMentionEvidence(raw);
      if (dmcMention) {
        await saveKnowledgeEvidenceIfNew({
          id: `evidence-${externalId}-dmc-mention`,
          incidentId: saved.incident.id,
          sourceId: "dmc_meteochile_mention",
          sourceName: "DMC (mencionado por SENAPRED)",
          title: `DMC citado en alerta SENAPRED: ${raw.title}`,
          summary: dmcMention.excerpt,
          confidenceScore: buildEvidenceConfidence(70, "medium"),
          locationConfidence: geometryResolved ? 90 : 40,
          timestampConfidence: 80,
          extractedAt: new Date().toISOString(),
        });
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `Failed to persist incident ${externalId}`);
    }
  };
  async function persistWorker() {
    for (let next = queue.shift(); next; next = queue.shift()) {
      await persistOne(next);
    }
  }
  await Promise.all(Array.from({ length: Math.min(PROMOTION_PERSIST_CONCURRENCY, promotable.length) }, () => persistWorker()));

  await finishIngestionRun(run.id, {
    status: errors.length > 0 ? "partial" : "success",
    recordsFetched: rawAlerts.length,
    recordsNormalized: incidents.length,
    recordsInserted: inserted,
    recordsUpdated: updated,
    recordsSkipped: skipped,
    metadataJson: { notPromoted },
  });

  return {
    status: errors.length > 0 ? "partial" : "success",
    runId: run.id,
    inserted,
    updated,
    skipped,
    notPromoted,
    incidents,
    errors,
  };
}
