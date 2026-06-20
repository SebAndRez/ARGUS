import { NextResponse } from "next/server";
import { getArgusSource } from "@/config/argusSourceRegistry";
import { deduplicateEvents } from "@/lib/ingestion/deduplicateEvents";
import { normalizeUsGsEarthquake } from "@/lib/ingestion/normalizeUsGsEarthquake";
import { persistFreshIngestion } from "@/lib/ingestion/persistExternalEvents";
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

const SOURCE_ID = "usgs_earthquake";
const SOURCE_CACHE_KEY = `ingestion:${SOURCE_ID}`;
const USGS_FEED_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson";
const REQUEST_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 60_000;

interface UsgsCachedData {
  events: ArgusNormalizedEvent[];
  sourceUpdatedAt: string | null;
}

export const dynamic = "force-dynamic";

function toIsoDate(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function buildResponse(
  entry: CachedSourceEntry<UsgsCachedData>,
  cached: boolean
): ArgusIngestionSourceResponse {
  const source = getArgusSource(SOURCE_ID);

  return {
    cached,
    fetchedAt: entry.fetchedAt,
    expiresAt: entry.expiresAt,
    sourceId: SOURCE_ID,
    sourceName: source?.name ?? "USGS Earthquake",
    sourceUpdatedAt: entry.data.sourceUpdatedAt,
    count: entry.data.events.length,
    events: entry.data.events,
  };
}

export async function GET() {
  const cachedEntry = getCachedSource<UsgsCachedData>(SOURCE_CACHE_KEY);
  if (cachedEntry) {
    return NextResponse.json(buildResponse(cachedEntry, true));
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
      return NextResponse.json(
        {
          error: "USGS no respondió correctamente.",
          sourceId: SOURCE_ID,
          sourceName: getArgusSource(SOURCE_ID)?.name ?? "USGS Earthquake",
          cached: false,
          upstreamStatus: response.status,
        },
        { status: 502 }
      );
    }

    const payload = (await response.json()) as UsgsEarthquakeFeatureCollection;
    if (payload.type !== "FeatureCollection" || !Array.isArray(payload.features)) {
      return NextResponse.json(
        {
          error: "USGS devolvió un formato GeoJSON no reconocido.",
          sourceId: SOURCE_ID,
          sourceName: getArgusSource(SOURCE_ID)?.name ?? "USGS Earthquake",
          cached: false,
        },
        { status: 502 }
      );
    }

    const normalizedEvents = payload.features
      .map(normalizeUsGsEarthquake)
      .filter((event): event is ArgusNormalizedEvent => event !== null);
    const events = deduplicateEvents(normalizedEvents);
    const cacheEntry = setCachedSource<UsgsCachedData>(
      SOURCE_CACHE_KEY,
      {
        events,
        sourceUpdatedAt: toIsoDate(payload.metadata?.generated),
      },
      CACHE_TTL_MS
    );
    const persistence = await persistFreshIngestion(SOURCE_ID, events, {
      fetchedAt: cacheEntry.fetchedAt,
      expiresAt: cacheEntry.expiresAt,
      startedAt,
    });

    return NextResponse.json({
      ...buildResponse(cacheEntry, false),
      ...persistence,
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return NextResponse.json(
      {
        error: timedOut
          ? "La consulta a USGS superó el tiempo de espera."
          : "No fue posible consultar USGS en este momento.",
        sourceId: SOURCE_ID,
        sourceName: getArgusSource(SOURCE_ID)?.name ?? "USGS Earthquake",
        cached: false,
      },
      { status: timedOut ? 504 : 502 }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
