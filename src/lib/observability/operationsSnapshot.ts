import { prisma } from "@/lib/prisma";
import { determineRateLimitBackendKind } from "@/lib/security/rateLimitBackend";
import { getSourceOperationsHealth } from "@/lib/vigia/sourceOperationsHealth";
import { VIGIA_SOURCE_REGISTRY } from "@/lib/vigia/sourceRegistry";
import { getRecentIngestionRunsBySource } from "@/lib/knowledge-intake/persistence/knowledgePersistenceService";
import { computeOverallHealth, isStale, type ComponentHealth, type OperationalHealthStatus } from "@/lib/observability/healthStatus";
import { getRecentIssues } from "@/lib/observability/recentIssuesBuffer";
import type { OperationalHealthSnapshot, OperationalIssue, PipelineHealth, SourcesComponentHealth } from "@/types/operationalHealth";

/**
 * ARGUS Prompt 19 §3-4, §23 — la única función que reúne salud
 * cross-cutting. No reimplementa nada: delega en `getSourceOperationsHealth`
 * (Prompt 16), `determineRateLimitBackendKind` (Prompt 12/13) y
 * `getRecentIngestionRunsBySource` (persistencia ya existente). El único
 * dato nuevo que calcula es la frescura por pipeline (§25) — no hay tabla de
 * "corrida de pipeline completa"; se deriva del mismo `KnowledgeIngestionRun`
 * que ya usa Source Health.
 */

const REQUIRED_ENV_VARS = ["DATABASE_URL", "AUTH_SECRET", "CRON_SECRET"];

const GLOBAL_WATCH_SOURCE_IDS = VIGIA_SOURCE_REGISTRY.filter((source) => source.id !== "senapred_eventos").map(
  (source) => source.id
);
const CHILE_ALERTS_SOURCE_IDS = ["senapred_eventos"];
const GLOBAL_WATCH_FRESHNESS_MINUTES = 45;
const CHILE_ALERTS_FRESHNESS_MINUTES = 45;

/** Mapea el `event` de un `OperationalLogEntry` a un runbook, cuando existe uno específico (§27). */
const RUNBOOK_BY_EVENT: Record<string, string> = {
  notification_source_fetch_failed: "incidente-critico-sin-notificacion",
  module_gateway_query_failed: "modulo-sin-contexto-canonico",
  map_projection_dropped: "incidente-critico-no-aparece-en-mapa",
};

async function checkPersistence(): Promise<ComponentHealth> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { component: "persistence", status: "healthy" };
  } catch (error) {
    return {
      component: "persistence",
      status: "unavailable",
      detail: error instanceof Error ? error.message : "Fallo desconocido al consultar la base de datos.",
    };
  }
}

function checkPlatformReadiness(): ComponentHealth {
  const missing = REQUIRED_ENV_VARS.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    return { component: "platform", status: "misconfigured", detail: `Faltan variables requeridas: ${missing.join(", ")}.` };
  }
  return { component: "platform", status: "healthy" };
}

function checkDistributedBackend(): ComponentHealth {
  const kind = determineRateLimitBackendKind();
  if (kind === "distributed") return { component: "distributed_backend", status: "healthy" };
  if (kind === "memory-development") {
    return { component: "distributed_backend", status: "degraded", detail: "Backend en memoria — solo válido fuera de producción." };
  }
  return {
    component: "distributed_backend",
    status: process.env.NODE_ENV === "production" ? "unavailable" : "disabled",
    detail: "Sin backend distribuido (Upstash) configurado.",
  };
}

async function checkPipelineFreshness(
  pipeline: PipelineHealth["pipeline"],
  sourceIds: string[],
  freshnessMinutes: number,
  now: Date
): Promise<{ component: ComponentHealth; pipeline: PipelineHealth }> {
  const runsBySource = await getRecentIngestionRunsBySource(sourceIds, 50);
  let lastSuccessAt: Date | null = null;
  for (const runs of runsBySource.values()) {
    for (const run of runs) {
      if ((run.status === "success" || run.status === "partial") && (!lastSuccessAt || run.startedAt > lastSuccessAt)) {
        lastSuccessAt = run.startedAt;
      }
    }
  }

  const freshnessMs = freshnessMinutes * 60_000;
  const stale = isStale(lastSuccessAt, freshnessMs, now);
  const status: OperationalHealthStatus = !lastSuccessAt ? "unknown" : stale ? "degraded" : "healthy";
  const detail = !lastSuccessAt
    ? "Sin ejecuciones exitosas registradas todavía."
    : stale
      ? `Último éxito hace ${Math.round((now.getTime() - lastSuccessAt.getTime()) / 60_000)} min (ventana esperada: ${freshnessMinutes} min).`
      : "Dentro de la ventana de frescura esperada.";

  return {
    component: { component: `pipeline_${pipeline}`, status, detail, lastObservedAt: lastSuccessAt?.toISOString() ?? null },
    pipeline: { pipeline, status, lastSuccessAt: lastSuccessAt?.toISOString() ?? null, freshnessWindowMinutes: freshnessMinutes, detail },
  };
}

function rollUpSources(entries: Awaited<ReturnType<typeof getSourceOperationsHealth>>): SourcesComponentHealth {
  let operational = 0;
  let degraded = 0;
  let broken = 0;
  let disabled = 0;

  for (const entry of entries) {
    switch (entry.verdict.status) {
      case "operational":
      case "manual_only":
      case "configured_not_scheduled":
        operational += 1;
        break;
      case "degraded":
        degraded += 1;
        break;
      case "broken":
      case "missing_credentials":
      case "not_configured":
        broken += 1;
        break;
      case "disabled":
      case "retired":
      case "stub":
        disabled += 1;
        break;
    }
  }

  const total = entries.length;
  let status: OperationalHealthStatus;
  if (total === 0) status = "unknown";
  else if (broken > total / 2) status = "unavailable";
  else if (broken > 0 || degraded > 0) status = "degraded";
  else status = "healthy";

  return { component: "sources", status, operational, degraded, broken, disabled, total };
}

/**
 * Notificaciones/proyección/módulos no tienen una señal de "éxito" que este
 * proceso pueda observar directamente (serían necesarias corridas
 * sintéticas, prohibidas por §36) — la señal honesta disponible es
 * "ausencia de fallos observados en la última hora", que se reporta como
 * `healthy` (sin problemas conocidos, no verificación activa — documentado
 * en ARGUS_OBSERVABILITY_BASELINE.md). Un fallo real en el buffer degrada
 * de inmediato; nunca se fabrica un estado peor o mejor del que el buffer
 * respalda.
 */
function rollUpFromRecentIssues(component: string, now: Date): ComponentHealth {
  const recent = getRecentIssues(60 * 60 * 1000, now).filter((entry) => entry.component === component);
  if (recent.length === 0) {
    return { component, status: "healthy", detail: "Sin fallos observados por este proceso en la última hora." };
  }
  return {
    component,
    status: "degraded",
    detail: `${recent.length} evento(s) de advertencia/error observado(s) en la última hora.`,
  };
}

function computeActiveIssues(now: Date): OperationalIssue[] {
  const recent = getRecentIssues(60 * 60 * 1000, now);
  const byKey = new Map<string, OperationalIssue>();
  for (const entry of recent) {
    const key = `${entry.component}:${entry.event}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.lastObservedAt = entry.timestamp;
      continue;
    }
    byKey.set(key, {
      code: key,
      severity: entry.level === "error" ? "high" : "medium",
      component: entry.component,
      status: "active",
      detectedAt: entry.timestamp,
      lastObservedAt: entry.timestamp,
      summary: `${entry.event} en ${entry.component}`,
      runbookId: RUNBOOK_BY_EVENT[entry.event],
    });
  }
  return Array.from(byKey.values());
}

export async function getOperationalHealthSnapshot(now: Date = new Date()): Promise<OperationalHealthSnapshot> {
  const [persistence, sourceEntries, globalWatch, chileAlerts] = await Promise.all([
    checkPersistence(),
    getSourceOperationsHealth(now),
    checkPipelineFreshness("global-watch", GLOBAL_WATCH_SOURCE_IDS, GLOBAL_WATCH_FRESHNESS_MINUTES, now),
    checkPipelineFreshness("chile-alerts", CHILE_ALERTS_SOURCE_IDS, CHILE_ALERTS_FRESHNESS_MINUTES, now),
  ]);

  const platform = checkPlatformReadiness();
  const distributedBackend = checkDistributedBackend();
  const sources = rollUpSources(sourceEntries);
  const notifications = rollUpFromRecentIssues("notifications", now);
  const projections = rollUpFromRecentIssues("map_projection", now);
  const modules = rollUpFromRecentIssues("canonical_incident_gateway", now);
  const activeIssues = computeActiveIssues(now);

  // Críticos (§24): sin ellos, la plataforma no puede cumplir su función
  // central. Un backend distribuido caído degrada (bloquea locks nuevos)
  // pero no dejar de servir mapa/notificaciones ya persistidos — importante,
  // no crítico.
  const critical: ComponentHealth[] = [persistence, platform, globalWatch.component, chileAlerts.component];
  const important: ComponentHealth[] = [distributedBackend, sources, notifications, projections, modules];

  return {
    generatedAt: now.toISOString(),
    overallStatus: computeOverallHealth(critical, important),
    platform,
    persistence,
    distributedBackend,
    pipelines: [globalWatch.pipeline, chileAlerts.pipeline],
    sources,
    notifications,
    projections,
    modules,
    activeIssues,
  };
}
