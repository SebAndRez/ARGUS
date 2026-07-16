import { NextRequest, NextResponse } from "next/server";
import { demoArgusEvents } from "@/data/demoArgusEvents";
import { getKnowledgeIncidents } from "@/lib/knowledge-intake/persistence/knowledgePersistenceService";
import { canonicalKnowledgeIncidentToArgusEvent } from "@/lib/canonical/canonicalKnowledgeIncidentToArgusEvent";
import { isDemoDataAllowed } from "@/lib/security/productionGuard";
import { isIncidentOperationallyActive } from "@/lib/lifecycle/operationalVisibilityPolicy";
import type {
  ArgusConfidence,
  ArgusEvent,
  ArgusEventStatus,
  ArgusEventType,
  ArgusSeverity,
  ArgusSourceType,
} from "@/types/argusEvent";

export const dynamic = "force-dynamic";

/**
 * ARGUS Prompt 14 — consolidación SENAPRED. Este endpoint solía llamar
 * `fetchSenapredAlerts()` (`senapredEventosAdapter.ts`) directamente en cada
 * request: una TERCERA consulta AppSync independiente de la ingestión
 * canónica (`/api/chile-alerts/run` + fuente `senapred_eventos` de Global
 * Watch, ambas ya consolidadas en `promoteChileOfficialAlerts` y protegidas
 * por el lock compartido `senapred-ingestion`, Prompt 13). Ahora lee
 * directamente la misma persistencia canónica (`KnowledgeIncident`) que
 * `/api/chile-alerts`/`/api/vigia/events` ya usan — misma entidad
 * persistida, misma proyección `ArgusEvent`, mismo `id` (mismo `idPrefix`
 * "chile-alert"), solo un contrato de filtros/respuesta propio de esta ruta
 * (country/eventType/status/sourceType/confidence/bbox), sin una segunda
 * consulta a la fuente oficial.
 */
const PERSISTENCE_SERVICE_MAX_LIMIT = 200;

function eventLat(event: ArgusEvent): number | null {
  if (event.geometry.type === "point") return event.geometry.coordinates[0];
  if (event.geometry.type === "region_reference" || event.geometry.type === "administrative_area") {
    return event.geometry.anchor[0];
  }
  if (event.geometry.type === "polygon" || event.geometry.type === "route") {
    const coords = event.geometry.coordinates;
    return coords.length ? coords[0][0] : null;
  }
  return null;
}

function eventLng(event: ArgusEvent): number | null {
  if (event.geometry.type === "point") return event.geometry.coordinates[1];
  if (event.geometry.type === "region_reference" || event.geometry.type === "administrative_area") {
    return event.geometry.anchor[1];
  }
  if (event.geometry.type === "polygon" || event.geometry.type === "route") {
    const coords = event.geometry.coordinates;
    return coords.length ? coords[0][1] : null;
  }
  return null;
}

type RealSourceOutcome =
  | { ok: true; events: ArgusEvent[] }
  | { ok: false; reason: string };

/**
 * Lee `KnowledgeIncident` (fuente `senapred_eventos`) — la misma
 * persistencia canónica que `/api/chile-alerts` — y proyecta con el mismo
 * mapeador único (Prompt 9). Nunca lanza; un fallo real de Prisma se
 * distingue explícitamente de "cero alertas vigentes ahora mismo" (Prompt 14
 * §23: una respuesta vacía válida no es un fallo) — solo el primero
 * dispara el fallback a datos demo más abajo.
 */
async function loadPersistedSenapredEvents(): Promise<RealSourceOutcome> {
  try {
    const incidents = await getKnowledgeIncidents({
      sourceId: "senapred_eventos",
      limit: PERSISTENCE_SERVICE_MAX_LIMIT,
    });
    const events = incidents
      .map((incident) => canonicalKnowledgeIncidentToArgusEvent(incident, { idPrefix: "chile-alert" }))
      .filter((event): event is NonNullable<typeof event> => Boolean(event));
    return { ok: true, events };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "SENAPRED persisted read failed" };
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const country = searchParams.get("country");
  const eventType = searchParams.get("eventType") as ArgusEventType | null;
  const severity = searchParams.get("severity") as ArgusSeverity | null;
  const status = searchParams.get("status") as ArgusEventStatus | null;
  const sourceType = searchParams.get("sourceType") as ArgusSourceType | null;
  const confidence = searchParams.get("confidence") as ArgusConfidence | null;
  const south = searchParams.get("south");
  const west = searchParams.get("west");
  const north = searchParams.get("north");
  const east = searchParams.get("east");
  const bbox =
    south && west && north && east
      ? {
          south: Number(south),
          west: Number(west),
          north: Number(north),
          east: Number(east),
        }
      : null;

  const demoModeForced = process.env.ARGUS_EVENTS_DEMO_MODE === "true";
  const demoAllowed = isDemoDataAllowed();

  let source: "senapred_persisted" | "curated_demo" = "curated_demo";
  let events: ArgusEvent[] = demoAllowed ? demoArgusEvents : [];
  let fallbackReason: string | null = demoModeForced
    ? demoAllowed
      ? "ARGUS_EVENTS_DEMO_MODE is enabled"
      : "ARGUS_EVENTS_DEMO_MODE blocked in production"
    : null;

  if (demoModeForced && !demoAllowed) {
    source = "senapred_persisted";
  } else if (!demoModeForced) {
    const outcome = await loadPersistedSenapredEvents();
    if (outcome.ok) {
      // Empty is a legitimate "no active official alerts right now" —
      // never treated as a failure requiring the demo fallback (Prompt 14
      // §23: "sin alertas oficiales ≠ fallo al consultar").
      source = "senapred_persisted";
      events = outcome.events;
      fallbackReason = null;
    } else {
      fallbackReason = outcome.reason;
      if (!demoAllowed) {
        source = "senapred_persisted";
        events = [];
      }
    }
  }

  const now = new Date();
  const filtered = events.filter((event) => {
    if (country && event.country.toUpperCase() !== country.toUpperCase()) return false;
    if (eventType && event.eventType !== eventType) return false;
    if (severity && event.severity !== severity) return false;
    if (status) {
      // `?status=` explícito es una consulta puntual/histórica intencional
      // (Prompt 10 §15) — no se le aplica el filtro de vigencia por defecto.
      if (event.status !== status) return false;
    } else if (!isIncidentOperationallyActive({ lifecycle: event.status, expiresAt: event.validUntil ?? null, now })) {
      return false;
    }
    if (sourceType && event.sourceType !== sourceType) return false;
    if (confidence && event.confidence !== confidence) return false;
    if (bbox) {
      const lat = eventLat(event);
      const lng = eventLng(event);
      if (lat === null || lng === null) return false;
      if (lat < bbox.south || lat > bbox.north || lng < bbox.west || lng > bbox.east) return false;
    }
    return true;
  });

  return NextResponse.json({
    source,
    ...(fallbackReason ? { fallbackReason } : {}),
    count: filtered.length,
    events: filtered,
  });
}
