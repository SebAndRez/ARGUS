import { NextRequest, NextResponse } from "next/server";
import { getKnowledgeIncidents } from "@/lib/knowledge-intake/persistence/knowledgePersistenceService";
import { canonicalKnowledgeIncidentToArgusEvent } from "@/lib/canonical/canonicalKnowledgeIncidentToArgusEvent";
import { isDemoDataAllowed } from "@/lib/security/productionGuard";
import { isIncidentOperationallyActive, logUnrecognizedLifecycle } from "@/lib/lifecycle/operationalVisibilityPolicy";
import { logOperationalEvent } from "@/lib/observability/operationalEvents";

export const dynamic = "force-dynamic";

/**
 * Persisted Chile official severe-weather alerts (SENAPRED, promoted by
 * `alertPromotionEngine`), converted to `ArgusEvent` so the operational map
 * can render them through the existing `ArgusEventLayer` (real polygon
 * geometry, severity coloring, detail panel) — not a new per-source layer.
 *
 * Excluye alertas resueltas/canceladas/archivadas (Prompt 10 — antes este
 * endpoint no aplicaba ningún filtro de lifecycle, así que una alerta ya
 * cancelada por SENAPRED seguía apareciendo como vigente indefinidamente).
 * `getKnowledgeIncidents` limita internamente a 200 filas — se sobre-consulta
 * dentro de ese techo y se recorta a `limit` DESPUÉS de filtrar, nunca antes
 * (mismo motivo que en `/api/vigia/events`, ver
 * docs/architecture/ARGUS_OPERATIONAL_LIFECYCLE_POLICY.md).
 */
const PERSISTENCE_SERVICE_MAX_LIMIT = 200;
const FETCH_OVERSCAN_MULTIPLIER = 3;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const severity = params.get("severity") ?? undefined;
  const includeDemo = params.get("includeDemo") === "true" && isDemoDataAllowed();
  const now = new Date();
  const requestedLimit = Math.min(Math.max(Number(params.get("limit") ?? 100) || 100, 1), PERSISTENCE_SERVICE_MAX_LIMIT);
  const fetchLimit = Math.min(requestedLimit * FETCH_OVERSCAN_MULTIPLIER, PERSISTENCE_SERVICE_MAX_LIMIT);

  const incidents = await getKnowledgeIncidents({
    sourceId: "senapred_eventos",
    limit: fetchLimit,
  });

  const severityFiltered = incidents.filter((incident) => !severity || incident.severity === severity);
  const projected = severityFiltered.map((incident) => canonicalKnowledgeIncidentToArgusEvent(incident, { idPrefix: "chile-alert" }));
  // Distinción Prompt 19 §19: solo cuenta fallos de proyección (sin geometría
  // resoluble), nunca exclusiones esperadas por severidad/lifecycle/demo.
  const projectionDroppedCount = projected.filter((event) => !event).length;
  if (projectionDroppedCount > 0) {
    logOperationalEvent({
      event: "map_projection_dropped",
      level: "warn",
      component: "map_projection",
      count: projectionDroppedCount,
      detail: { source: "chile_alerts", fetched: severityFiltered.length },
    });
  }

  const events = projected
    .filter((event): event is NonNullable<typeof event> => Boolean(event))
    .filter((event) => {
      const active = isIncidentOperationallyActive({ lifecycle: event.status, expiresAt: event.validUntil ?? null, now });
      if (!active && event.status !== "resolved" && event.status !== "archived") {
        logUnrecognizedLifecycle({ id: event.id, source: "chile_alerts", lifecycle: event.status });
      }
      return active;
    })
    .filter((event) => includeDemo || !event.isDemo)
    .slice(0, requestedLimit);

  return NextResponse.json({
    source: "senapred_eventos_persisted",
    count: events.length,
    projectionDroppedCount,
    events,
  });
}
