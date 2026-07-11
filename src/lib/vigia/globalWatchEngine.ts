import { fetchUsgsEarthquakes } from "@/lib/knowledge-intake/adapters/usgsAdapter";
import { fetchGdacsEvents } from "@/lib/knowledge-intake/adapters/gdacsAdapter";
import { fetchEonetEvents } from "@/lib/knowledge-intake/adapters/eonetAdapter";
import { fetchFirmsActiveFires } from "@/lib/knowledge-intake/adapters/firmsAdapter";
import { fetchReliefWebReports } from "@/lib/knowledge-intake/adapters/reliefwebAdapter";
import { fetchEffisWildfires } from "@/lib/vigia/adapters/effisAdapter";
import { fetchCopernicusEmsActivations } from "@/lib/vigia/adapters/copernicusEmsAdapter";
import { fetchChileOfficialAlertsRaw } from "@/lib/sources/chile/senapredProvider";
import { promoteChileOfficialAlerts } from "@/lib/incidents/alertPromotionEngine";
import { chileAlertsSeed } from "@/data/chileAlertsSeed";
import { globalWatchSeedIncidents } from "@/data/globalWatchSeed";
import {
  createIngestionRun,
  finishIngestionRun,
  saveKnowledgeEvidenceIfNew,
  upsertKnowledgeIncidentByExternalId,
} from "@/lib/knowledge-intake/persistence/knowledgePersistenceService";
import {
  evaluateIncidentPromotion,
  mergeCorroboratingEvents,
  type PromotedEvent,
} from "@/lib/vigia/alertPromotionEngine";
import { clusterFirmsIncidents, firmsClusterToIncident } from "@/lib/vigia/firmsClusterer";
import { sweepIncidentLifecycles, type LifecycleSweepSummary } from "@/lib/vigia/incidentLifecycle";
import { classifyGlobalThreat } from "@/lib/vigia/threatClassifier";
import {
  VIGIA_SOURCE_REGISTRY,
  getVigiaSource,
  isVigiaSourceConfigured,
  type VigiaSourceDefinition,
} from "@/lib/vigia/sourceRegistry";
import type {
  ArgusEvidenceConfidenceScore,
  ArgusIncidentKnowledge,
} from "@/types/knowledgeIntake";

/**
 * ARGUS Global Watch: motor operacional que convierte fuentes externas
 * (USGS, GDACS, EONET, FIRMS, EFFIS, Copernicus EMS, ReliefWeb, SENAPRED)
 * en `KnowledgeIncident` persistidos, priorizados, deduplicados y visibles
 * en el mapa (/api/vigia/events) y el centro de notificaciones
 * (/api/notifications lee KnowledgeIncident high/critical directamente).
 *
 * Cadena por corrida:
 *   fetch por fuente → normalizar → clasificar amenaza → clustering FIRMS →
 *   reglas de promoción → fusión multi-fuente (sube confianza) →
 *   upsert incidente + evidencias → sweep de ciclo de vida → resumen.
 */

export type GlobalWatchRunOptions = {
  /** Usa fixtures QA (src/data/globalWatchSeed.ts) en lugar de llamar APIs externas. */
  seedMode?: boolean;
  /** Limita la corrida a estas fuentes (ids del registry VIGÍA). */
  onlySources?: string[];
};

export type GlobalWatchSourceSummary = {
  sourceId: string;
  sourceName: string;
  status: "success" | "partial" | "failed" | "skipped" | "disabled";
  fetched: number;
  normalized: number;
  incidentsCreated: number;
  incidentsUpdated: number;
  incidentsSkipped: number;
  evidenceCreated: number;
  notificationsGenerated: number;
  candidatesCreated: number;
  warnings: string[];
  errors: string[];
  durationMs: number;
};

export type GlobalWatchSummary = {
  status: "success" | "partial" | "failed";
  seedMode: boolean;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  sourcesConsulted: number;
  incidentsCreated: number;
  incidentsUpdated: number;
  evidenceCreated: number;
  notificationsGenerated: number;
  candidatesCreated: number;
  lifecycle: LifecycleSweepSummary | null;
  errorsBySource: Record<string, string[]>;
  sources: GlobalWatchSourceSummary[];
};

type FetchResult = {
  fetched: number;
  incidents: ArgusIncidentKnowledge[];
  warnings: string[];
  errors: string[];
};

/**
 * FIRMS con bbox mundial devuelve cientos de miles de filas; se consulta
 * por regiones operacionales (Chile+Cono Sur, Europa/Mediterráneo).
 * Sobreescribible con ARGUS_FIRMS_BBOXES="w,s,e,n;w,s,e,n".
 */
const DEFAULT_FIRMS_BBOXES = ["-76,-56,-66,-17", "-11,34,45,62"];

function firmsBboxes(): string[] {
  const raw = process.env.ARGUS_FIRMS_BBOXES;
  if (!raw) return DEFAULT_FIRMS_BBOXES;
  return raw
    .split(";")
    .map((bbox) => bbox.trim())
    .filter(Boolean);
}

async function runSourceFetch(source: VigiaSourceDefinition, seedMode: boolean): Promise<FetchResult> {
  if (seedMode) {
    const seeds = globalWatchSeedIncidents.filter(
      (incident) => incident.sourceIds[0] === source.id
    );
    // Los fixtures FIRMS son focos individuales: pasan por el clusterer
    // real para validar que N detecciones produzcan UN incidente.
    if (source.id === "nasa_firms") {
      const incidents = clusterFirmsIncidents(seeds).map(firmsClusterToIncident);
      return { fetched: seeds.length, incidents, warnings: [`${seeds.length} focos seed agrupados en ${incidents.length} cluster(s).`], errors: [] };
    }
    return { fetched: seeds.length, incidents: seeds, warnings: [], errors: [] };
  }

  switch (source.id) {
    case "usgs_earthquake": {
      const result = await fetchUsgsEarthquakes({ feed: "relevant", limit: 100 });
      return { fetched: result.count, incidents: result.incidents, warnings: [], errors: [] };
    }
    case "gdacs": {
      const result = await fetchGdacsEvents({ daysBack: 3, limit: 120 });
      return { fetched: result.fetched, incidents: result.incidents, warnings: result.warnings, errors: result.errors };
    }
    case "nasa-eonet": {
      const result = await fetchEonetEvents({ status: "open", days: 5, limit: 150 });
      return { fetched: result.fetched, incidents: result.incidents, warnings: result.warnings, errors: result.errors };
    }
    case "nasa_firms": {
      const warnings: string[] = [];
      const errors: string[] = [];
      const foci: ArgusIncidentKnowledge[] = [];
      let fetched = 0;
      for (const bbox of firmsBboxes()) {
        try {
          // NOAA-21 es el VIIRS operativo vigente (SNPP dejó de publicar;
          // verificado 2026-07: SNPP/NOAA-20 devuelven 0 filas). days=2
          // porque "1" es solo el día UTC en curso, que puede venir vacío
          // según la hora de procesamiento.
          const result = await fetchFirmsActiveFires({ bbox, days: 2, source: "VIIRS_NOAA21_NRT" });
          if ("disabled" in result && result.disabled) {
            return { fetched: 0, incidents: [], warnings: [result.message ?? "FIRMS deshabilitado"], errors: [] };
          }
          fetched += result.count;
          foci.push(...result.incidents);
        } catch (error) {
          errors.push(error instanceof Error ? error.message : `FIRMS falló para bbox ${bbox}`);
        }
      }
      // Tope de clusters por corrida (los más densos primero) para que un
      // día extremo de temporada de incendios no inunde el mapa.
      const clusters = clusterFirmsIncidents(foci)
        .sort((a, b) => b.count - a.count)
        .slice(0, 100);
      const incidents = clusters.map(firmsClusterToIncident);
      if (foci.length > 0) {
        warnings.push(`${foci.length} focos térmicos agrupados en ${incidents.length} cluster(s).`);
      }
      return { fetched, incidents, warnings, errors };
    }
    case "copernicus_effis": {
      const result = await fetchEffisWildfires({ daysBack: 7, minAreaHa: 30 });
      return { fetched: result.fetched, incidents: result.incidents, warnings: result.warnings, errors: result.errors };
    }
    case "copernicus_ems": {
      const result = await fetchCopernicusEmsActivations({ daysBack: 14 });
      return { fetched: result.fetched, incidents: result.incidents, warnings: result.warnings, errors: result.errors };
    }
    case "reliefweb": {
      const result = await fetchReliefWebReports({ limit: 30 });
      if ("disabled" in result && result.disabled) {
        return { fetched: 0, incidents: [], warnings: [result.message ?? "ReliefWeb sin configurar"], errors: [] };
      }
      return { fetched: result.count, incidents: result.incidents, warnings: [], errors: [] };
    }
    case "news_evidence":
      // Sin feed automático de prensa todavía: NewsEvidence participa vía
      // fixtures QA (seedMode) y evidencia curada manual. La corrida queda
      // registrada para que Source Health muestre la fuente como viva.
      return { fetched: 0, incidents: [], warnings: ["NewsEvidence opera como fuente secundaria (fixtures/curaduría manual)."], errors: [] };
    default:
      return { fetched: 0, incidents: [], warnings: [`Fuente ${source.id} sin runner implementado.`], errors: [] };
  }
}

function buildEvidenceConfidence(finalConfidence: number): ArgusEvidenceConfidenceScore {
  return {
    sourceReliability: finalConfidence,
    corroborationCount: 1,
    geolocationPrecision: finalConfidence,
    timestampPrecision: 80,
    documentQuality: 75,
    extractionConfidence: 80,
    conflictWithOtherSources: 0,
    finalConfidence,
    label: finalConfidence >= 75 ? "high" : finalConfidence >= 55 ? "medium" : "low",
  };
}

function emptySourceSummary(source: VigiaSourceDefinition): GlobalWatchSourceSummary {
  return {
    sourceId: source.id,
    sourceName: source.name,
    status: "skipped",
    fetched: 0,
    normalized: 0,
    incidentsCreated: 0,
    incidentsUpdated: 0,
    incidentsSkipped: 0,
    evidenceCreated: 0,
    notificationsGenerated: 0,
    candidatesCreated: 0,
    warnings: [],
    errors: [],
    durationMs: 0,
  };
}

/**
 * SENAPRED tiene su propio pipeline probado (clasificador de clima severo +
 * geometría administrativa + evidencia DMC) — se reutiliza intacto en lugar
 * de duplicarlo aquí.
 */
async function runSenapredSource(source: VigiaSourceDefinition, seedMode: boolean): Promise<GlobalWatchSourceSummary> {
  const startedAt = Date.now();
  const summary = emptySourceSummary(source);
  try {
    const { alerts, warnings, errors } = seedMode
      ? { alerts: chileAlertsSeed, warnings: [] as string[], errors: [] as string[] }
      : await fetchChileOfficialAlertsRaw();
    const promotion = await promoteChileOfficialAlerts(alerts);
    summary.status = promotion.status === "success" ? "success" : promotion.status === "partial" ? "partial" : "failed";
    summary.fetched = alerts.length;
    summary.normalized = promotion.incidents.length;
    summary.incidentsCreated = promotion.inserted;
    summary.incidentsUpdated = promotion.updated;
    summary.incidentsSkipped = promotion.skipped;
    summary.evidenceCreated = promotion.incidents.length;
    summary.notificationsGenerated = promotion.inserted + promotion.updated;
    summary.warnings = warnings;
    summary.errors = [...errors, ...promotion.errors];
  } catch (error) {
    summary.status = "failed";
    summary.errors = [error instanceof Error ? error.message : "SENAPRED pipeline failed"];
  }
  summary.durationMs = Date.now() - startedAt;
  return summary;
}

export async function runGlobalWatch(options: GlobalWatchRunOptions = {}): Promise<GlobalWatchSummary> {
  const startedAt = new Date();
  const seedMode = options.seedMode ?? false;
  const only = options.onlySources?.length ? new Set(options.onlySources) : null;

  const sourcesToRun = VIGIA_SOURCE_REGISTRY.filter((source) => {
    if (only && !only.has(source.id)) return false;
    // Fuentes de contexto (Open-Meteo) y de evidencia derivada (menciones
    // DMC, extraídas dentro del pipeline SENAPRED) no se fetchean solas.
    if (source.role === "context" || source.id === "dmc_meteochile_mention") return false;
    return true;
  });

  const sourceSummaries: GlobalWatchSourceSummary[] = [];
  const promotedBySource = new Map<string, PromotedEvent[]>();
  const runIdBySource = new Map<string, string | null>();

  // 1-2. Fetch + normalización + promoción por fuente (en paralelo).
  await Promise.all(
    sourcesToRun.map(async (source) => {
      if (!source.enabled || !isVigiaSourceConfigured(source)) {
        const summary = emptySourceSummary(source);
        summary.status = "disabled";
        summary.warnings = [
          source.enabled
            ? `Falta configurar ${source.requiresEnvVar}.`
            : "Fuente deshabilitada en el registry.",
        ];
        sourceSummaries.push(summary);
        return;
      }

      if (source.id === "senapred_eventos") {
        sourceSummaries.push(await runSenapredSource(source, seedMode));
        return;
      }

      const summary = emptySourceSummary(source);
      const sourceStart = Date.now();
      let runId: string | null = null;
      try {
        const run = await createIngestionRun({
          sourceId: source.id,
          sourceName: source.name,
          metadataJson: { trigger: "global-watch", seedMode },
        });
        runId = run.id;
      } catch {
        // Sin registro de corrida no se aborta la ingesta: solo se pierde telemetría.
      }
      runIdBySource.set(source.id, runId);

      try {
        const result = await runSourceFetch(source, seedMode);
        summary.fetched = result.fetched;
        summary.warnings.push(...result.warnings);
        summary.errors.push(...result.errors);

        const promoted = result.incidents.map((incident) => evaluateIncidentPromotion(incident, source));
        summary.normalized = promoted.length;
        promotedBySource.set(source.id, promoted);
        summary.status = result.errors.length > 0 ? "partial" : "success";
      } catch (error) {
        summary.status = "failed";
        summary.errors.push(error instanceof Error ? error.message : `Fuente ${source.id} falló.`);
        promotedBySource.set(source.id, []);
      }
      summary.durationMs = Date.now() - sourceStart;
      sourceSummaries.push(summary);
    })
  );

  // 3. Fusión cross-fuente: mismo evento visto por varias fuentes se
  //    consolida y sube confianza en lugar de duplicarse.
  const allPromoted = [...promotedBySource.values()].flat();
  const mergedEvents = mergeCorroboratingEvents(allPromoted);

  // 4. Persistencia: incidentes/candidatos → KnowledgeIncident + evidencias.
  //    En lotes concurrentes acotados: la BD es remota y cada evento cuesta
  //    varios round-trips; secuencial puro multiplica la latencia por N.
  const PERSIST_CONCURRENCY = 6;
  const persistQueue = [...mergedEvents];
  const persistWorker = async () => {
    for (let event = persistQueue.shift(); event; event = persistQueue.shift()) {
      await persistPromotedEvent(event);
    }
  };
  const persistPromotedEvent = async (event: PromotedEvent) => {
    const primarySourceId = event.incident.sourceIds[0] ?? "unknown";
    const summary = sourceSummaries.find((item) => item.sourceId === primarySourceId);
    if (event.outcome === "evidence") {
      // Evidencia sin incidente asociado solo para severidad media+ (evita ruido).
      return;
    }
    try {
      const saved = await upsertKnowledgeIncidentByExternalId(event.incident);
      if (summary) {
        if (saved.action === "inserted") summary.incidentsCreated += 1;
        if (saved.action === "updated") summary.incidentsUpdated += 1;
        if (saved.action === "skipped") summary.incidentsSkipped += 1;
        if (event.outcome === "candidate") summary.candidatesCreated += 1;
        if (event.generatesNotification && saved.action !== "skipped") {
          summary.notificationsGenerated += 1;
        }
      }

      // Evidencia por cada fuente que vio el evento (primaria + corroborantes).
      for (const sourceId of event.incident.sourceIds) {
        const sourceDefinition = getVigiaSource(sourceId);
        const evidenceResult = await saveKnowledgeEvidenceIfNew({
          id: `evidence-${event.incident.id}-${sourceId}`,
          incidentId: saved.incident.id,
          sourceId,
          sourceName: sourceDefinition?.name ?? sourceId,
          title: event.incident.title,
          url: event.incident.rawEvidenceRefs[0],
          summary: event.incident.summary.slice(0, 500),
          confidenceScore: buildEvidenceConfidence(sourceDefinition?.reliabilityScore ?? 60),
          locationConfidence: typeof event.incident.latitude === "number" ? 80 : 40,
          timestampConfidence: event.incident.occurredAt ? 85 : 50,
          extractedAt: new Date().toISOString(),
        });
        if (summary && evidenceResult.action === "inserted") summary.evidenceCreated += 1;
      }
    } catch (error) {
      if (summary) {
        summary.errors.push(error instanceof Error ? error.message : `No se pudo persistir ${event.incident.id}`);
        if (summary.status === "success") summary.status = "partial";
      }
    }
  };
  await Promise.all(Array.from({ length: PERSIST_CONCURRENCY }, () => persistWorker()));

  // 5. Cerrar corridas de ingesta con contadores reales.
  for (const summary of sourceSummaries) {
    const runId = runIdBySource.get(summary.sourceId);
    if (!runId) continue;
    try {
      await finishIngestionRun(runId, {
        status: summary.status === "disabled" || summary.status === "skipped" ? "skipped" : summary.status,
        recordsFetched: summary.fetched,
        recordsNormalized: summary.normalized,
        recordsInserted: summary.incidentsCreated,
        recordsUpdated: summary.incidentsUpdated,
        recordsSkipped: summary.incidentsSkipped,
        errorMessage: summary.errors[0],
        warningsJson: summary.warnings.length > 0 ? summary.warnings : undefined,
        metadataJson: {
          notificationsGenerated: summary.notificationsGenerated,
          candidatesCreated: summary.candidatesCreated,
          durationMs: summary.durationMs,
        },
      });
    } catch {
      // Telemetría best-effort.
    }
  }

  // 6. Ciclo de vida (new/active/monitoring/contained/resolved/archived).
  let lifecycle: LifecycleSweepSummary | null = null;
  try {
    lifecycle = await sweepIncidentLifecycles(
      VIGIA_SOURCE_REGISTRY.map((source) => source.id),
      (incident) => classifyGlobalThreat({ domain: incident.domain, subtype: incident.subtype })
    );
  } catch {
    lifecycle = null;
  }

  const finishedAt = new Date();
  const errorsBySource: Record<string, string[]> = {};
  for (const summary of sourceSummaries) {
    if (summary.errors.length > 0) errorsBySource[summary.sourceId] = summary.errors;
  }

  const anyFailure = sourceSummaries.some((summary) => summary.status === "failed");
  const allFailed = sourceSummaries.length > 0 && sourceSummaries.every((summary) => summary.status === "failed" || summary.status === "disabled");

  return {
    status: allFailed ? "failed" : anyFailure || Object.keys(errorsBySource).length > 0 ? "partial" : "success",
    seedMode,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    sourcesConsulted: sourceSummaries.filter((summary) => summary.status !== "disabled" && summary.status !== "skipped").length,
    incidentsCreated: sourceSummaries.reduce((acc, summary) => acc + summary.incidentsCreated, 0),
    incidentsUpdated: sourceSummaries.reduce((acc, summary) => acc + summary.incidentsUpdated, 0),
    evidenceCreated: sourceSummaries.reduce((acc, summary) => acc + summary.evidenceCreated, 0),
    notificationsGenerated: sourceSummaries.reduce((acc, summary) => acc + summary.notificationsGenerated, 0),
    candidatesCreated: sourceSummaries.reduce((acc, summary) => acc + summary.candidatesCreated, 0),
    lifecycle,
    errorsBySource,
    sources: sourceSummaries.sort((a, b) => a.sourceId.localeCompare(b.sourceId)),
  };
}
