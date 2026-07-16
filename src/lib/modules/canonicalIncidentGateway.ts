import { prisma } from "@/lib/prisma";
import { canonicalKnowledgeIncidentToArgusEvent } from "@/lib/canonical/canonicalKnowledgeIncidentToArgusEvent";
import { isIncidentOperationallyActive } from "@/lib/lifecycle/operationalVisibilityPolicy";
import { isDemoDataAllowed } from "@/lib/security/productionGuard";
import { logOperationalEvent } from "@/lib/observability/operationalEvents";
import type { ArgusEvent } from "@/types/argusEvent";
import type {
  ModuleContextError,
  ModuleIncidentFilters,
  ModuleIncidentPage,
  ModuleIncidentSummary,
  ModuleVerificationStatus,
} from "@/types/moduleOperationalContext";

/**
 * ARGUS Prompt 17 — `CanonicalIncidentGateway`: único punto server-side que
 * ATLAS/VIGÍA/ORÁCULO/TALOS deben usar para leer incidentes canónicos.
 *
 * Reutiliza, sin reimplementar:
 * - persistencia canónica vigente (`prisma.knowledgeIncident`, Prompt 8);
 * - proyección canónica única (`canonicalKnowledgeIncidentToArgusEvent`, Prompt 9);
 * - política de vigencia (`isIncidentOperationallyActive`, Prompt 10);
 * - guarda de datos demo (`isDemoDataAllowed`, ya usada por `/api/vigia/events`/`/api/argus/events`).
 *
 * No introduce un segundo modelo canónico. `ModuleIncidentSummary.id` es el
 * `KnowledgeIncident.id` crudo (identidad interna estable, Prompt 8 §7.1) —
 * deliberadamente NO uno de los `id` prefijados que ya usan `/api/vigia/events`
 * (`vigia-*`) o `/api/argus/events` (`chile-alert-*`): esos prefijos son un
 * artefacto de presentación de esos dos endpoints históricos, no la
 * identidad canónica en sí. Los cuatro módulos comparten esta identidad
 * cruda entre ellos (Prompt 17 §10); no se garantiza que coincida con el id
 * mostrado por el mapa general (fuera de alcance de esta tarea).
 */

const DEFAULT_MODULE_INCIDENTS_LIMIT = 50;
const MAX_MODULE_INCIDENTS_LIMIT = 100;
const DEFAULT_WINDOW_DAYS = 30;
const FETCH_OVERSCAN_MULTIPLIER = 3;
const MAX_FETCH_ROWS = 600;

/**
 * Fuentes que representan una alerta oficial en sentido estricto (autoridad
 * emisora, no solo "dato de origen oficial" — ver Prompt 15 §5 para la misma
 * distinción aplicada a incendios: FIRMS/EFFIS/EMS son oficiales como
 * *proveedor de datos* pero no constituyen una alerta institucional por sí
 * solas). Deliberadamente más angosto que `VIGIA_SOURCE_REGISTRY.isOfficial`
 * (que marca TODAS estas fuentes `true`, incluidas FIRMS/EFFIS/EMS) y
 * conceptualmente equivalente a `OFFICIAL_KNOWLEDGE_SOURCES` de
 * `notificationCenterEngine.ts` — no importado desde aquí porque ese archivo
 * está fuera de alcance de esta tarea (Prompt 17 §37: "no debe modificar...
 * notificaciones generales"). Mantener ambas listas sincronizadas
 * manualmente es una limitación documentada (ver
 * `docs/modules/ARGUS_CORE_MODULE_INTEGRATION.md`).
 */
const NARROW_OFFICIAL_ALERT_SOURCE_IDS = new Set(["senapred_eventos", "usgs_earthquake", "gdacs", "nasa-eonet", "reliefweb"]);

/** Observación satelital/institucional que corrobora pero no es, por sí sola, una alerta oficial. */
const OBSERVATION_ONLY_SOURCE_IDS = new Set(["nasa_firms", "copernicus_effis", "copernicus_ems"]);

function deriveVerificationStatus(event: ArgusEvent, primarySourceId: string): ModuleVerificationStatus {
  if (event.needsOfficialConfirmation) return "candidate";
  if (NARROW_OFFICIAL_ALERT_SOURCE_IDS.has(primarySourceId)) return "official";
  if (OBSERVATION_ONLY_SOURCE_IDS.has(primarySourceId)) return "corroborated";
  if (event.sourceType === "citizen") return "unverified";
  if (event.sourceType === "official") return "official";
  if (event.sourceType === "global_feed" || event.sourceType === "technical") return "corroborated";
  return "candidate";
}

type KnowledgeIncidentRow = Awaited<ReturnType<typeof prisma.knowledgeIncident.findFirst>>;

function toModuleIncidentSummary(row: NonNullable<KnowledgeIncidentRow>): ModuleIncidentSummary | null {
  const event = canonicalKnowledgeIncidentToArgusEvent(row, { idPrefix: "module" });
  if (!event) return null;

  const regionCode = row.region ?? null;
  return {
    id: row.id,
    type: event.eventType,
    title: event.title,
    summary: event.operationalSummary ?? null,
    severity: event.severity,
    lifecycle: event.status,
    verificationStatus: deriveVerificationStatus(event, row.sourceId),
    confidence: event.confidence,
    location: {
      latitude: row.latitude,
      longitude: row.longitude,
      geometry: event.geometry,
      countryCode: row.country ?? null,
      regionCode,
    },
    timing: {
      startedAt: event.validFrom ?? null,
      updatedAt: event.lastUpdated,
      expiresAt: event.validUntil ?? null,
    },
    sourceSummary: {
      primarySource: event.attribution ?? row.sourceName ?? null,
      sourceCount: event.sources?.length ?? 1,
      isOfficial: event.sourceType === "official",
    },
    isDemo: Boolean(event.isDemo),
  };
}

function encodeCursor(offset: number): string {
  return Buffer.from(`offset:${offset}`, "utf8").toString("base64url");
}

/** Cursor opaco = offset numérico codificado — elección deliberadamente simple (Prompt 17 §9: "cursor o paginación existente"); documentado como limitación en vez de construir un keyset cursor completo para un volumen de filas todavía modesto. */
function decodeCursor(cursor: string | null | undefined): number {
  if (!cursor) return 0;
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const match = /^offset:(\d+)$/.exec(decoded);
    if (!match) return 0;
    const offset = Number(match[1]);
    return Number.isFinite(offset) && offset >= 0 ? offset : 0;
  } catch {
    return 0;
  }
}

export type ModuleIncidentGatewayResult =
  | { ok: true; page: ModuleIncidentPage }
  | { ok: false; error: ModuleContextError };

/**
 * Lista incidentes canónicos con filtros/paginación acotados. Nunca
 * consulta sin límite (Prompt 17 §9, §23): `limit` siempre se acota a
 * `MAX_MODULE_INCIDENTS_LIMIT`, y la ventana temporal por defecto es de 30
 * días si el llamador no especifica `dateFrom`.
 */
export async function fetchCanonicalModuleIncidents(filters: ModuleIncidentFilters = {}): Promise<ModuleIncidentGatewayResult> {
  const limit = Math.min(Math.max(filters.limit ?? DEFAULT_MODULE_INCIDENTS_LIMIT, 1), MAX_MODULE_INCIDENTS_LIMIT);
  const includeDemo = Boolean(filters.includeDemo) && isDemoDataAllowed();
  const since = filters.dateFrom ? new Date(filters.dateFrom) : new Date(Date.now() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const until = filters.dateTo ? new Date(filters.dateTo) : undefined;
  const offset = decodeCursor(filters.cursor);
  const fetchTake = Math.min(limit * FETCH_OVERSCAN_MULTIPLIER, MAX_FETCH_ROWS);

  let rows: NonNullable<KnowledgeIncidentRow>[];
  try {
    rows = await prisma.knowledgeIncident.findMany({
      where: {
        updatedAt: { gte: since, ...(until ? { lte: until } : {}) },
        ...(filters.countryCode ? { country: filters.countryCode } : {}),
        ...(filters.regionCode ? { region: filters.regionCode } : {}),
        ...(filters.source ? { sourceId: filters.source } : {}),
        ...(filters.severity?.length ? { severity: { in: filters.severity } } : {}),
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      skip: offset,
      take: fetchTake + 1,
    });
  } catch (error) {
    logOperationalEvent({
      event: "module_gateway_query_failed",
      level: "error",
      component: "canonical_incident_gateway",
      errorCode: "DATA_UNAVAILABLE",
      detail: { operation: "list", message: error instanceof Error ? error.message : "unknown" },
    });
    return { ok: false, error: { code: "DATA_UNAVAILABLE", message: "No fue posible consultar incidentes canónicos." } };
  }

  const hasMoreRaw = rows.length > fetchTake;
  const pageRows = hasMoreRaw ? rows.slice(0, fetchTake) : rows;
  const now = new Date();

  let summaries = pageRows
    .map(toModuleIncidentSummary)
    .filter((summary): summary is ModuleIncidentSummary => Boolean(summary))
    .filter((summary) => includeDemo || !summary.isDemo)
    .filter((summary) => isIncidentOperationallyActive({ lifecycle: summary.lifecycle, expiresAt: summary.timing.expiresAt, now }))
    .filter((summary) => !filters.lifecycle?.length || filters.lifecycle.includes(summary.lifecycle))
    .filter((summary) => !filters.type?.length || filters.type.includes(summary.type))
    .filter((summary) => !filters.verificationStatus?.length || filters.verificationStatus.includes(summary.verificationStatus));

  const hasMore = hasMoreRaw || summaries.length > limit;
  summaries = summaries.slice(0, limit);

  return {
    ok: true,
    page: {
      summaries,
      nextCursor: hasMore ? encodeCursor(offset + fetchTake) : null,
    },
  };
}

export type ModuleIncidentByIdResult =
  | { ok: true; summary: ModuleIncidentSummary }
  | { ok: false; error: ModuleContextError };

/**
 * Recupera un único incidente canónico por identidad estable
 * (`KnowledgeIncident.id`). Usado por la selección cruzada de incidente
 * (Prompt 17 §10) y como entrada de ORÁCULO/TALOS (§13-§14).
 */
export async function fetchCanonicalModuleIncidentById(id: string): Promise<ModuleIncidentByIdResult> {
  if (!id || typeof id !== "string" || id.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    return { ok: false, error: { code: "INVALID_INCIDENT_ID", message: "Identificador de incidente inválido." } };
  }

  let row: KnowledgeIncidentRow;
  try {
    row = await prisma.knowledgeIncident.findUnique({ where: { id } });
  } catch (error) {
    logOperationalEvent({
      event: "module_gateway_query_failed",
      level: "error",
      component: "canonical_incident_gateway",
      errorCode: "DATA_UNAVAILABLE",
      incidentId: id,
      detail: { operation: "by_id", message: error instanceof Error ? error.message : "unknown" },
    });
    return { ok: false, error: { code: "DATA_UNAVAILABLE", message: "No fue posible consultar el incidente." } };
  }

  if (!row) {
    return { ok: false, error: { code: "INCIDENT_NOT_FOUND", message: "El incidente solicitado no existe." } };
  }

  const summary = toModuleIncidentSummary(row);
  if (!summary) {
    return { ok: false, error: { code: "INSUFFICIENT_DATA", message: "El incidente no tiene geometría suficiente para proyectarse." } };
  }
  if (summary.isDemo && !isDemoDataAllowed()) {
    return { ok: false, error: { code: "INCIDENT_NOT_FOUND", message: "El incidente solicitado no existe." } };
  }
  return { ok: true, summary };
}
