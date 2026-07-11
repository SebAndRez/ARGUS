import { prisma } from "@/lib/prisma";
import type { GlobalThreatType } from "@/lib/vigia/threatClassifier";

/**
 * Declarative registry of every source ARGUS Global Watch consults. This is
 * the single place where a source's coverage, threat types, reliability,
 * cadence and promotion power (incident vs evidence-only) are declared —
 * `globalWatchEngine` iterates this list, and the Source Health dashboard
 * renders it joined with runtime state from `KnowledgeIngestionRun`.
 */

export type VigiaCoverage = "global" | "regional" | "country";

/**
 * - `incident`: the source is authoritative enough to create a
 *   `KnowledgeIncident` directly (subject to promotion rules).
 * - `evidence`: the source can only attach `KnowledgeEvidence` /
 *   candidate incidents that require corroboration ("No confirmado").
 * - `context`: enrichment only (e.g. Open-Meteo weather context); never
 *   creates incidents on its own.
 */
export type VigiaSourceRole = "incident" | "evidence" | "context";

export type VigiaSourceDefinition = {
  id: string;
  name: string;
  coverage: VigiaCoverage;
  /** ISO country code when coverage === "country", region label when regional. */
  coverageDetail?: string;
  threatTypes: GlobalThreatType[];
  /** 0-100; also used as the default sourceReliabilityScore of promoted incidents. */
  reliabilityScore: number;
  isOfficial: boolean;
  refreshIntervalMinutes: number;
  /** Public endpoint or method description (no secrets). */
  endpoint: string;
  role: VigiaSourceRole;
  /** Env var that must be present for the source to run, if any. */
  requiresEnvVar?: string;
  enabled: boolean;
};

export const VIGIA_SOURCE_REGISTRY: VigiaSourceDefinition[] = [
  {
    id: "usgs_earthquake",
    name: "USGS Earthquake Hazards",
    coverage: "global",
    threatTypes: ["EARTHQUAKE", "TSUNAMI"],
    reliabilityScore: 94,
    isOfficial: true,
    refreshIntervalMinutes: 5,
    endpoint: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson",
    role: "incident",
    enabled: true,
  },
  {
    id: "gdacs",
    name: "GDACS (UN/EC Global Disaster Alert)",
    coverage: "global",
    threatTypes: ["EARTHQUAKE", "TSUNAMI", "CYCLONE", "FLOOD", "VOLCANO", "WILDFIRE", "HUMANITARIAN_CRISIS"],
    reliabilityScore: 92,
    isOfficial: true,
    refreshIntervalMinutes: 15,
    endpoint: "https://www.gdacs.org/xml/rss.xml",
    role: "incident",
    enabled: true,
  },
  {
    id: "nasa-eonet",
    name: "NASA EONET Natural Events",
    coverage: "global",
    threatTypes: ["WILDFIRE", "FLOOD", "SEVERE_WEATHER", "VOLCANO", "CYCLONE", "LANDSLIDE"],
    reliabilityScore: 88,
    isOfficial: true,
    refreshIntervalMinutes: 30,
    endpoint: "https://eonet.gsfc.nasa.gov/api/v3/events/geojson",
    role: "incident",
    enabled: true,
  },
  {
    id: "nasa_firms",
    name: "NASA FIRMS (focos térmicos satelitales)",
    coverage: "global",
    threatTypes: ["WILDFIRE"],
    reliabilityScore: 80,
    isOfficial: true,
    refreshIntervalMinutes: 15,
    endpoint: "https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/VIIRS_SNPP_NRT/{bbox}/{days}",
    role: "incident",
    requiresEnvVar: "NASA_FIRMS_MAP_KEY",
    enabled: true,
  },
  {
    id: "copernicus_effis",
    name: "Copernicus EFFIS (incendios Europa)",
    coverage: "regional",
    coverageDetail: "Europa / Mediterráneo",
    threatTypes: ["WILDFIRE"],
    reliabilityScore: 90,
    isOfficial: true,
    refreshIntervalMinutes: 30,
    endpoint: "https://maps.effis.emergency.copernicus.eu/effis (WFS GeoJSON, burnt areas + active season)",
    role: "incident",
    enabled: true,
  },
  {
    id: "copernicus_ems",
    name: "Copernicus Emergency Management Service",
    coverage: "global",
    threatTypes: ["WILDFIRE", "FLOOD", "EARTHQUAKE", "CYCLONE", "LANDSLIDE", "VOLCANO", "HUMANITARIAN_CRISIS"],
    reliabilityScore: 91,
    isOfficial: true,
    refreshIntervalMinutes: 60,
    endpoint: "https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations-info/ (JSON de activaciones EMSR)",
    role: "incident",
    enabled: true,
  },
  {
    id: "reliefweb",
    name: "ReliefWeb (OCHA)",
    coverage: "global",
    threatTypes: ["HUMANITARIAN_CRISIS", "FLOOD", "CYCLONE", "EARTHQUAKE", "WILDFIRE"],
    reliabilityScore: 82,
    isOfficial: true,
    refreshIntervalMinutes: 30,
    endpoint: "https://api.reliefweb.int/v2/reports?appname={RELIEFWEB_APP_NAME}",
    role: "incident",
    requiresEnvVar: "RELIEFWEB_APP_NAME",
    enabled: true,
  },
  {
    id: "senapred_eventos",
    name: "SENAPRED Chile (alertas oficiales)",
    coverage: "country",
    coverageDetail: "CL",
    threatTypes: ["SEVERE_WEATHER", "TORNADO", "WATERSPOUT", "SEVERE_WIND", "FLOOD", "LANDSLIDE", "WILDFIRE"],
    reliabilityScore: 95,
    isOfficial: true,
    refreshIntervalMinutes: 15,
    endpoint: "https://senapred.cl (scraper oficial vía fetchChileOfficialAlertsRaw)",
    role: "incident",
    enabled: true,
  },
  {
    id: "dmc_meteochile_mention",
    name: "DMC MeteoChile (citada por SENAPRED)",
    coverage: "country",
    coverageDetail: "CL",
    threatTypes: ["SEVERE_WEATHER", "SEVERE_WIND", "TORNADO", "WATERSPOUT"],
    reliabilityScore: 90,
    isOfficial: true,
    refreshIntervalMinutes: 15,
    endpoint: "Sin feed directo; evidencia extraída de alertas SENAPRED (extractDmcMentionEvidence)",
    role: "evidence",
    enabled: true,
  },
  {
    id: "open-meteo",
    name: "Open-Meteo (contexto meteorológico)",
    coverage: "global",
    threatTypes: ["SEVERE_WEATHER", "WILDFIRE", "FLOOD"],
    reliabilityScore: 75,
    isOfficial: false,
    refreshIntervalMinutes: 60,
    endpoint: "https://api.open-meteo.com/v1/forecast",
    role: "context",
    enabled: true,
  },
  {
    id: "news_evidence",
    name: "NewsEvidence (prensa curada, fuente secundaria)",
    coverage: "global",
    threatTypes: [
      "WILDFIRE",
      "FLOOD",
      "SEVERE_WEATHER",
      "EARTHQUAKE",
      "HUMANITARIAN_CRISIS",
      "INFRASTRUCTURE_DAMAGE",
      "RESCUE_OPERATION",
      "CIVIL_UNREST",
    ],
    reliabilityScore: 60,
    isOfficial: false,
    refreshIntervalMinutes: 30,
    endpoint: "Curada interna (/api/news-evidence) + GDELT como señal de cobertura",
    role: "evidence",
    enabled: true,
  },
];

export function getVigiaSource(sourceId: string): VigiaSourceDefinition | undefined {
  return VIGIA_SOURCE_REGISTRY.find((source) => source.id === sourceId);
}

export function isVigiaSourceConfigured(source: VigiaSourceDefinition): boolean {
  if (!source.requiresEnvVar) return true;
  return Boolean(process.env[source.requiresEnvVar]);
}

export type VigiaSourceHealthStatus = "OK" | "WARN" | "ERROR" | "DISABLED";

export type VigiaSourceHealth = {
  sourceId: string;
  name: string;
  coverage: VigiaCoverage;
  coverageDetail?: string;
  threatTypes: GlobalThreatType[];
  reliabilityScore: number;
  isOfficial: boolean;
  role: VigiaSourceRole;
  refreshIntervalMinutes: number;
  endpoint: string;
  status: VigiaSourceHealthStatus;
  statusReason: string;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastError: string | null;
  eventsFetched: number;
  incidentsCreated: number;
  incidentsPersistedTotal: number;
  nextRunEstimate: string | null;
};

function resolveStatus(
  source: VigiaSourceDefinition,
  latestRun: { status: string; startedAt: Date; errorMessage: string | null } | null
): { status: VigiaSourceHealthStatus; reason: string } {
  if (!source.enabled) return { status: "DISABLED", reason: "Fuente deshabilitada en el registry." };
  if (!isVigiaSourceConfigured(source)) {
    return { status: "DISABLED", reason: `Falta configurar ${source.requiresEnvVar}.` };
  }
  if (source.role === "context") {
    return { status: "OK", reason: "Fuente de contexto; se consulta bajo demanda por incidente." };
  }
  if (!latestRun) return { status: "WARN", reason: "Sin ejecuciones registradas todavía." };
  if (latestRun.status === "failed") {
    return { status: "ERROR", reason: latestRun.errorMessage ?? "Última ejecución falló." };
  }
  const ageMinutes = (Date.now() - latestRun.startedAt.getTime()) / 60_000;
  // Two full refresh cycles without a run (min 30 min) counts as stale.
  const staleThreshold = Math.max(source.refreshIntervalMinutes * 2, 30);
  if (ageMinutes > staleThreshold) {
    return { status: "WARN", reason: `Sin actualización hace ${Math.round(ageMinutes)} min.` };
  }
  if (latestRun.status === "partial") {
    return { status: "WARN", reason: latestRun.errorMessage ?? "Última ejecución parcial (con errores por ítem)." };
  }
  return { status: "OK", reason: "Operativa." };
}

/**
 * Joins the static registry with runtime state (`KnowledgeIngestionRun` +
 * persisted `KnowledgeIncident` counts) to answer, per source: ¿está viva,
 * cuándo corrió, qué obtuvo, qué falló y cuándo vuelve a correr?
 */
export async function getVigiaSourceHealth(): Promise<VigiaSourceHealth[]> {
  const sourceIds = VIGIA_SOURCE_REGISTRY.map((source) => source.id);
  const [latestRuns, incidentCounts] = await Promise.all([
    prisma.knowledgeIngestionRun.findMany({
      where: { sourceId: { in: sourceIds } },
      orderBy: { startedAt: "desc" },
      take: 200,
    }),
    prisma.knowledgeIncident.groupBy({
      by: ["sourceId"],
      where: { sourceId: { in: sourceIds } },
      _count: { sourceId: true },
    }),
  ]);

  const latestBySource = new Map<string, (typeof latestRuns)[number]>();
  for (const run of latestRuns) {
    if (!latestBySource.has(run.sourceId)) latestBySource.set(run.sourceId, run);
  }
  const totalsBySource = new Map(incidentCounts.map((item) => [item.sourceId, item._count.sourceId]));

  return VIGIA_SOURCE_REGISTRY.map((source) => {
    const latest = latestBySource.get(source.id) ?? null;
    const { status, reason } = resolveStatus(source, latest);
    const lastRunAt = latest?.startedAt ?? null;
    return {
      sourceId: source.id,
      name: source.name,
      coverage: source.coverage,
      coverageDetail: source.coverageDetail,
      threatTypes: source.threatTypes,
      reliabilityScore: source.reliabilityScore,
      isOfficial: source.isOfficial,
      role: source.role,
      refreshIntervalMinutes: source.refreshIntervalMinutes,
      endpoint: source.endpoint,
      status,
      statusReason: reason,
      lastRunAt: lastRunAt ? lastRunAt.toISOString() : null,
      lastRunStatus: latest?.status ?? null,
      lastError: latest?.errorMessage ?? null,
      eventsFetched: latest?.recordsFetched ?? 0,
      incidentsCreated: (latest?.recordsInserted ?? 0) + (latest?.recordsUpdated ?? 0),
      incidentsPersistedTotal: totalsBySource.get(source.id) ?? 0,
      nextRunEstimate:
        lastRunAt && source.enabled && isVigiaSourceConfigured(source)
          ? new Date(lastRunAt.getTime() + source.refreshIntervalMinutes * 60_000).toISOString()
          : null,
    };
  });
}
