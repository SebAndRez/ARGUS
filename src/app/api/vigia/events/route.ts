import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canonicalKnowledgeIncidentToArgusEvent } from "@/lib/canonical/canonicalKnowledgeIncidentToArgusEvent";
import { VIGIA_SOURCE_REGISTRY } from "@/lib/vigia/sourceRegistry";
import { isDemoDataAllowed } from "@/lib/security/productionGuard";
import { isIncidentOperationallyActive, logUnrecognizedLifecycle } from "@/lib/lifecycle/operationalVisibilityPolicy";
import { logOperationalEvent } from "@/lib/observability/operationalEvents";
import { MASTER_INCIDENT_SOURCE_ID } from "@/lib/incidents/masterIncidentRules";
import { computeRecommendedModules } from "@/lib/modules/moduleActivationEngine";

export const dynamic = "force-dynamic";

/**
 * Incidentes globales persistidos por ARGUS Global Watch, convertidos a
 * `ArgusEvent` para que el mapa los renderice por la ruta existente
 * `ArgusEventLayer` (junto a las alertas Chile de `/api/chile-alerts`).
 *
 * Filtros: `?severity=critical`, `?threat=WILDFIRE` (por tag vigia),
 * `?days=7`, `?limit=200`. Por defecto excluye incidentes resueltos,
 * archivados y cualquier otro estado terminal (Prompt 10 — ver
 * docs/architecture/ARGUS_OPERATIONAL_LIFECYCLE_POLICY.md).
 */
const VIGIA_SOURCE_IDS = [
  ...VIGIA_SOURCE_REGISTRY
    .filter((source) => source.id !== "senapred_eventos") // Chile ya se sirve por /api/chile-alerts.
    .map((source) => source.id),
  // Incidentes maestros sintéticos del ARGUS Fusion Engine (correlación
  // cross-amenaza, `src/lib/incidents/masterIncidentEngine.ts`) — no vienen
  // del registry de fuentes (no fetchean nada), pero deben verse en el mapa
  // igual que cualquier otro incidente.
  MASTER_INCIDENT_SOURCE_ID,
];

/**
 * `technicalFactorsJson.lifecycle` vive en JSON, no en una columna — Prisma
 * no puede filtrar eso de forma portable en la query (Prompt 10 §9), así
 * que se sobre-consulta un margen y se filtra en memoria inmediatamente
 * después de leer, ANTES de recortar a `limit` — de lo contrario, una
 * página podría devolver menos de `limit` eventos vigentes aunque existan
 * más disponibles (bug de paginación documentado en el Prompt 10).
 * Limitación conocida: si más del 66% de la ventana sobre-consultada
 * resulta no vigente, la página puede devolver menos de `limit` eventos
 * igualmente — ver la política documentada para el detalle.
 */
const FETCH_OVERSCAN_MULTIPLIER = 3;
const MAX_FETCH_ROWS = 800;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const severity = params.get("severity") ?? undefined;
  const threat = params.get("threat")?.toUpperCase() ?? undefined;
  const includeDemo = params.get("includeDemo") === "true" && isDemoDataAllowed();
  const days = Math.min(Math.max(Number(params.get("days") ?? 14) || 14, 1), 60);
  const limit = Math.min(Math.max(Number(params.get("limit") ?? 200) || 200, 1), 400);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const now = new Date();
  const fetchTake = Math.min(limit * FETCH_OVERSCAN_MULTIPLIER, MAX_FETCH_ROWS);

  // `severity` filters the DB query by the *stored* value, which for GDACS
  // rows persisted before the v1.0.3.2 severity fix can still say "critical"
  // — fetch on the raw column, but re-filter below on the canonicalized
  // value `canonicalKnowledgeIncidentToArgusEvent` actually returns, so
  // `?severity=` never contradicts what the response body shows.
  const incidents = await prisma.knowledgeIncident.findMany({
    where: {
      sourceId: { in: VIGIA_SOURCE_IDS },
      updatedAt: { gte: since },
      latitude: { not: null },
      longitude: { not: null },
      ...(severity ? { severity } : {}),
    },
    orderBy: [{ severity: "asc" }, { updatedAt: "desc" }],
    take: fetchTake,
  });

  const projected = incidents.map((incident) => canonicalKnowledgeIncidentToArgusEvent(incident, { idPrefix: "vigia" }));
  // Distinción Prompt 19 §19: esto solo cuenta lo que falló al proyectarse
  // (sin geometría resoluble) — nunca lo que el usuario o la política de
  // lifecycle excluyeron a propósito, eso se sigue filtrando abajo sin contar como "drop".
  const projectionDroppedCount = projected.filter((event) => !event).length;
  if (projectionDroppedCount > 0) {
    logOperationalEvent({
      event: "map_projection_dropped",
      level: "warn",
      component: "map_projection",
      count: projectionDroppedCount,
      detail: { source: "vigia_events", fetched: incidents.length },
    });
  }

  const incidentById = new Map(incidents.map((incident) => [incident.id, incident]));

  const events = projected
    .filter((event): event is NonNullable<typeof event> => Boolean(event))
    .filter((event) => {
      const active = isIncidentOperationallyActive({ lifecycle: event.status, expiresAt: event.validUntil ?? null, now });
      if (!active && event.status !== "resolved" && event.status !== "archived") {
        // Solo el caso "no reconocido" amerita registro — resolved/archived
        // son exclusiones esperadas, no una señal de datos corruptos.
        logUnrecognizedLifecycle({ id: event.id, source: "vigia_events", lifecycle: event.status });
      }
      return active;
    })
    .filter((event) => includeDemo || !event.isDemo)
    .filter((event) => !severity || event.severity === severity)
    .filter((event) => !threat || event.tags?.includes(`vigia:${threat.toLowerCase()}`))
    .slice(0, limit)
    .map((event) => {
      // `event.id` es `vigia-${incident.id}` (idPrefix fijo de esta ruta) —
      // recomendación calculada en lectura (ARGUS Fusion Engine), nunca
      // persistida en el DTO ni usada para navegar automáticamente.
      const source = incidentById.get(event.id.replace(/^vigia-/, ""));
      if (!source) return event;
      return {
        ...event,
        recommendedModules: computeRecommendedModules({
          domain: source.domain,
          subtype: source.subtype,
          effectiveSeverity: source.effectiveSeverity,
          severity: source.severity,
        }),
      };
    });

  return NextResponse.json({
    source: "argus_global_watch",
    count: events.length,
    projectionDroppedCount,
    events,
  });
}
