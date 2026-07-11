import { NextRequest, NextResponse } from "next/server";
import { getKnowledgeIncidents } from "@/lib/knowledge-intake/persistence/knowledgePersistenceService";
import { knowledgeIncidentToArgusEvent } from "@/lib/knowledge-intake/map/knowledgeIncidentToArgusEvent";
import { isDemoDataAllowed } from "@/lib/security/productionGuard";

export const dynamic = "force-dynamic";

/**
 * Persisted Chile official severe-weather alerts (SENAPRED, promoted by
 * `alertPromotionEngine`), converted to `ArgusEvent` so the operational map
 * can render them through the existing `ArgusEventLayer` (real polygon
 * geometry, severity coloring, detail panel) — not a new per-source layer.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const severity = params.get("severity") ?? undefined;
  const includeDemo = params.get("includeDemo") === "true" && isDemoDataAllowed();

  const incidents = await getKnowledgeIncidents({
    sourceId: "senapred_eventos",
    limit: params.get("limit") ? Number(params.get("limit")) : 100,
  });

  const events = incidents
    .filter((incident) => !severity || incident.severity === severity)
    .map((incident) => knowledgeIncidentToArgusEvent(incident))
    .filter((event): event is NonNullable<typeof event> => Boolean(event))
    .filter((event) => includeDemo || !event.isDemo);

  return NextResponse.json({
    source: "senapred_eventos_persisted",
    count: events.length,
    events,
  });
}
