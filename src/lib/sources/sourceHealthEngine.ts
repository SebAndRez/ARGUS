import {
  ARGUS_OPERATIONAL_SOURCE_REGISTRY,
  type SourceCategory,
  type SourceDefinition,
  type SourceOperationalStatus,
} from "@/lib/sources/sourceRegistry";
import type { SourceCacheMetadata } from "@/lib/ingestion/sourceCache";

export interface SourceRuntimeMetadata {
  sourceId: string;
  cache?: SourceCacheMetadata | null;
  persistedCount?: number;
  latestRun?: {
    status: string;
    fetchedAt: Date | string;
    completedAt?: Date | string | null;
    count?: number | null;
    cached?: boolean;
    error?: string | null;
  } | null;
}

export interface SourceHealthView extends SourceDefinition {
  freshnessLabel: string;
  lastUpdatedAt: string | null;
  warnings: string[];
  persistedCount: number;
}

export function buildSourceHealthSummary(runtime: SourceRuntimeMetadata[] = []) {
  const sources = ARGUS_OPERATIONAL_SOURCE_REGISTRY.map((source) =>
    buildSourceHealthView(source, runtime.find((item) => item.sourceId === source.id))
  );

  return {
    generatedAt: new Date().toISOString(),
    totalSources: sources.length,
    active: sources.filter((source) => source.status === "ACTIVE").length,
    degraded: sources.filter((source) => source.status === "DEGRADED").length,
    disabled: sources.filter((source) => source.status === "DISABLED").length,
    demo: sources.filter((source) => source.isDemo || source.status === "DEMO_ONLY").length,
    needsKey: sources.filter((source) => source.status === "NEEDS_KEY").length,
    needsReview: sources.filter((source) => source.status === "NEEDS_REVIEW").length,
    officialCount: sources.filter((source) => source.isOfficial).length,
    citizenCount: sources.filter((source) => source.reliability === "CITIZEN").length,
    sensorCount: sources.filter((source) => source.reliability === "SENSOR").length,
    sources,
  };
}

export function calculateSourceFreshness(
  source: SourceDefinition,
  cache?: SourceCacheMetadata | null
) {
  if (!cache?.fetchedAt) return "Sin consulta reciente";
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(cache.fetchedAt)) / 60000));
  if (minutes <= source.refreshIntervalMinutes) return `Actualizado hace ${minutes} min`;
  return `Posible stale: ${minutes} min`;
}

export function classifySourceStatus(
  source: SourceDefinition,
  cache?: SourceCacheMetadata | null,
  latestError?: string | null
): SourceOperationalStatus {
  if (source.status === "DEMO_ONLY" || source.status === "DISABLED" || source.status === "NEEDS_REVIEW") {
    return source.status;
  }
  if (source.requiresKey && source.apiEnvVar && !process.env[source.apiEnvVar]) return "NEEDS_KEY";
  if (latestError) return "ERROR";
  if (cache?.fetchedAt && Date.now() - Date.parse(cache.fetchedAt) > source.refreshIntervalMinutes * 2 * 60000) {
    return "DEGRADED";
  }
  return source.status === "NEEDS_KEY" && !source.requiresKey ? "NEEDS_REVIEW" : "ACTIVE";
}

export function getSourceWarnings(
  source: SourceDefinition,
  status: SourceOperationalStatus,
  latestError?: string | null
) {
  const warnings: string[] = [];
  if (status === "NEEDS_KEY") warnings.push(`${source.name} requiere configuracion segura de key o app name.`);
  if (status === "DEMO_ONLY") warnings.push(`${source.name} es demo/runtime; no tratar como fuente oficial.`);
  if (status === "NEEDS_REVIEW") warnings.push(`${source.name} requiere revision legal/terminos antes de produccion.`);
  if (status === "DEGRADED") warnings.push(`${source.name} puede estar stale o fuera de intervalo recomendado.`);
  if (status === "ERROR") warnings.push(`${source.name} reporta error reciente: ${latestError ?? "sin detalle"}.`);
  if (!source.isOfficial && source.reliability !== "CITIZEN") warnings.push("No presentar como autoridad oficial.");
  return warnings;
}

export function getSourcesByCategory(category: SourceCategory) {
  return ARGUS_OPERATIONAL_SOURCE_REGISTRY.filter((source) => source.category === category);
}

export function getOperationalSources() {
  return ARGUS_OPERATIONAL_SOURCE_REGISTRY.filter((source) => source.status === "ACTIVE");
}

export function getDemoSources() {
  return ARGUS_OPERATIONAL_SOURCE_REGISTRY.filter((source) => source.isDemo || source.status === "DEMO_ONLY");
}

function buildSourceHealthView(
  source: SourceDefinition,
  runtime?: SourceRuntimeMetadata
): SourceHealthView {
  const latestError = runtime?.latestRun?.error ?? null;
  const status = classifySourceStatus(source, runtime?.cache, latestError);
  const lastUpdatedAt = runtime?.cache?.fetchedAt ?? toIso(runtime?.latestRun?.fetchedAt) ?? null;
  return {
    ...source,
    status,
    freshnessLabel: calculateSourceFreshness(source, runtime?.cache),
    lastUpdatedAt,
    warnings: getSourceWarnings(source, status, latestError),
    persistedCount: runtime?.persistedCount ?? 0,
  };
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}
