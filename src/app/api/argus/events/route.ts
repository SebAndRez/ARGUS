import { NextRequest, NextResponse } from "next/server";
import { demoArgusEvents } from "@/data/demoArgusEvents";
import { fetchSenapredAlerts } from "@/lib/adapters/senapred/senapredEventosAdapter";
import { correlateSignals } from "@/lib/correlation/argusCorrelationEngine";
import { getCachedSource, setCachedSource } from "@/lib/ingestion/sourceCache";
import { isDemoDataAllowed } from "@/lib/security/productionGuard";
import type {
  ArgusConfidence,
  ArgusEvent,
  ArgusEventStatus,
  ArgusEventType,
  ArgusSeverity,
  ArgusSourceType,
} from "@/types/argusEvent";

export const dynamic = "force-dynamic";

const SOURCE_CACHE_KEY = "argus-events:senapred_eventos";
const CACHE_TTL_MS = 5 * 60_000;

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

interface SenapredEventsCacheData {
  events: ArgusEvent[];
}

type RealSourceOutcome =
  | { ok: true; events: ArgusEvent[]; cached: boolean }
  | { ok: false; reason: string };

/**
 * Live SENAPRED source for the "official alerts" map layer. Falls back to
 * `demoArgusEvents` (caller's responsibility) whenever this returns
 * `ok: false` — never throws.
 */
async function loadSenapredEvents(): Promise<RealSourceOutcome> {
  const cached = getCachedSource<SenapredEventsCacheData>(SOURCE_CACHE_KEY);
  if (cached) {
    return { ok: true, events: cached.data.events, cached: true };
  }

  try {
    const result = await fetchSenapredAlerts();
    if (result.status === "error") {
      return { ok: false, reason: result.errors[0] ?? "SENAPRED live fetch failed" };
    }
    if (result.signals.length === 0) {
      return { ok: false, reason: "SENAPRED returned no active alerts for the lookback window" };
    }

    const events = correlateSignals(result.signals);
    setCachedSource<SenapredEventsCacheData>(SOURCE_CACHE_KEY, { events }, CACHE_TTL_MS);
    return { ok: true, events, cached: false };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "SENAPRED live fetch failed",
    };
  }
}

/**
 * Real SENAPRED events are the primary source for this endpoint; the
 * hand-curated `demoArgusEvents` (`@/data/demoArgusEvents`) is used only as
 * an explicit fallback — either because the live source failed/returned
 * nothing, or because `ARGUS_EVENTS_DEMO_MODE=true` forces demo data (e.g.
 * for screenshots/demos where a stable dataset is wanted). The filter
 * contract (country/eventType/severity/status/sourceType/confidence/bbox) is
 * unchanged either way, so `ArgusEventLayer` never needs to know which
 * source produced the data.
 */
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

  let source: "senapred_live" | "senapred_live_cached" | "curated_demo" = "curated_demo";
  let events: ArgusEvent[] = demoAllowed ? demoArgusEvents : [];
  let fallbackReason: string | null = demoModeForced
    ? demoAllowed
      ? "ARGUS_EVENTS_DEMO_MODE is enabled"
      : "ARGUS_EVENTS_DEMO_MODE blocked in production"
    : null;

  if (demoModeForced && !demoAllowed) {
    source = "senapred_live";
  } else if (!demoModeForced) {
    const outcome = await loadSenapredEvents();
    if (outcome.ok) {
      source = outcome.cached ? "senapred_live_cached" : "senapred_live";
      events = outcome.events;
      fallbackReason = null;
    } else {
      fallbackReason = outcome.reason;
      if (!demoAllowed) {
        source = "senapred_live";
        events = [];
      }
    }
  }

  const filtered = events.filter((event) => {
    if (country && event.country.toUpperCase() !== country.toUpperCase()) return false;
    if (eventType && event.eventType !== eventType) return false;
    if (severity && event.severity !== severity) return false;
    if (status && event.status !== status) return false;
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
