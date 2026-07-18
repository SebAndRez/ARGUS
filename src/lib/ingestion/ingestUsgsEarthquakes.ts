import { getArgusSource } from "@/config/argusSourceRegistry";
import { deduplicateEvents } from "@/lib/ingestion/deduplicateEvents";
import { normalizeUsGsEarthquake } from "@/lib/ingestion/normalizeUsGsEarthquake";
import { persistFreshIngestion, recordIngestionRun } from "@/lib/ingestion/persistExternalEvents";
import {
  getCachedSource,
  setCachedSource,
  type CachedSourceEntry,
} from "@/lib/ingestion/sourceCache";
import type {
  ArgusIngestionSourceResponse,
  ArgusNormalizedEvent,
  UsgsEarthquakeFeatureCollection,
} from "@/types/ingestion";

export const USGS_SOURCE_ID = "usgs_earthquake";
export const USGS_SOURCE_CACHE_KEY = `ingestion:${USGS_SOURCE_ID}`;
const USGS_FEED_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson";
const REQUEST_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 60_000;

interface UsgsCachedData {
  events: ArgusNormalizedEvent[];
  sourceUpdatedAt: string | null;
}

function toIsoDate(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function buildResponse(
  entry: CachedSourceEntry<UsgsCachedData>,
  cached: boolean
): ArgusIngestionSourceResponse {
  const source = getArgusSource(USGS_SOURCE_ID);

  return {
    cached,
    fetchedAt: entry.fetchedAt,
    expiresAt: entry.expiresAt,
    sourceId: USGS_SOURCE_ID,
    sourceName: source?.name ?? "USGS Earthquake",
    sourceUpdatedAt: entry.data.sourceUpdatedAt,
    count: entry.data.events.length,
    events: entry.data.events,
  };
}

/**
 * Fetches (or reuses the in-memory 60s cache of) the USGS earthquake feed,
 * normalizes/dedupes it and persists it to `ExternalEvent`. This is the single
 * entry point for USGS earthquake data so the map layer and the Notification
 * Center never diverge - both call this instead of the map reading a local
 * fetch and the Notification Center reading only whatever was previously
 * persisted to the DB.
 */
export async function getOrFetchUsgsEarthquakes(): Promise<
  ArgusIngestionSourceResponse | { error: string; upstreamStatus?: number; timedOut?: boolean }
> {
  const cachedEntry = getCachedSource<UsgsCachedData>(USGS_SOURCE_CACHE_KEY);
  if (cachedEntry) {
    return buildResponse(cachedEntry, true);
  }

  const controller = new AbortController();
  const startedAt = Date.now();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(USGS_FEED_URL, {
      cache: "no-store",
      headers: {
        Accept: "application/geo+json, application/json",
        "User-Agent": "ARGUS-GRID/0.1 external-data-ingestion",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      await recordIngestionRun(USGS_SOURCE_ID, "error", {
        error: `USGS respondió con estado ${response.status}.`,
        durationMs: Date.now() - startedAt,
      });
      return {
        error: "USGS no respondió correctamente.",
        upstreamStatus: response.status,
      };
    }

    const payload = (await response.json()) as UsgsEarthquakeFeatureCollection;
    if (payload.type !== "FeatureCollection" || !Array.isArray(payload.features)) {
      await recordIngestionRun(USGS_SOURCE_ID, "error", {
        error: "USGS devolvió un formato GeoJSON no reconocido.",
        durationMs: Date.now() - startedAt,
      });
      return { error: "USGS devolvió un formato GeoJSON no reconocido." };
    }

    const normalizedEvents = payload.features
      .map(normalizeUsGsEarthquake)
      .filter((event): event is ArgusNormalizedEvent => event !== null);
    const events = deduplicateEvents(normalizedEvents);
    const cacheEntry = setCachedSource<UsgsCachedData>(
      USGS_SOURCE_CACHE_KEY,
      {
        events,
        sourceUpdatedAt: toIsoDate(payload.metadata?.generated),
      },
      CACHE_TTL_MS
    );
    const persistence = await persistFreshIngestion(USGS_SOURCE_ID, events, {
      fetchedAt: cacheEntry.fetchedAt,
      expiresAt: cacheEntry.expiresAt,
      startedAt,
    });

    return {
      ...buildResponse(cacheEntry, false),
      ...persistence,
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    const message = timedOut
      ? "La consulta a USGS superó el tiempo de espera."
      : "No fue posible consultar USGS en este momento.";
    await recordIngestionRun(USGS_SOURCE_ID, "error", {
      error: message,
      durationMs: Date.now() - startedAt,
    });
    return { error: message, timedOut };
  } finally {
    clearTimeout(timeoutId);
  }
}
