import { NextResponse } from "next/server";
import { getArgusSource } from "@/config/argusSourceRegistry";
import { deduplicateEvents } from "@/lib/ingestion/deduplicateEvents";
import {
  normalizeGdacsAlert,
  parseGdacsRss,
} from "@/lib/ingestion/normalizeGdacsAlert";
import { persistFreshIngestion, recordIngestionRun } from "@/lib/ingestion/persistExternalEvents";
import {
  getCachedSource,
  setCachedSource,
  type CachedSourceEntry,
} from "@/lib/ingestion/sourceCache";
import type {
  ArgusIngestionSourceResponse,
  ArgusNormalizedEvent,
} from "@/types/ingestion";

const SOURCE_ID = "gdacs";
const SOURCE_CACHE_KEY = `ingestion:${SOURCE_ID}`;
const GDACS_FEED_URLS = [
  "https://www.gdacs.org/xml/rss_24h.xml",
  "https://www.gdacs.org/xml/rss_7d.xml",
];
const REQUEST_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 5 * 60_000;

interface GdacsCachedData {
  events: ArgusNormalizedEvent[];
  sourceUpdatedAt: string | null;
}

export const dynamic = "force-dynamic";

function buildResponse(
  entry: CachedSourceEntry<GdacsCachedData>,
  cached: boolean
): ArgusIngestionSourceResponse {
  const source = getArgusSource(SOURCE_ID);

  return {
    cached,
    fetchedAt: entry.fetchedAt,
    expiresAt: entry.expiresAt,
    sourceId: SOURCE_ID,
    sourceName: source?.name ?? "GDACS Global Disaster Alerts",
    sourceUpdatedAt: entry.data.sourceUpdatedAt,
    count: entry.data.events.length,
    events: entry.data.events,
  };
}

async function fetchGdacsFeed(url: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/rss+xml, application/xml, text/xml",
        "User-Agent": "ARGUS-GRID/0.1 external-data-ingestion",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`GDACS respondió con estado ${response.status}.`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function GET() {
  const cachedEntry = getCachedSource<GdacsCachedData>(SOURCE_CACHE_KEY);
  if (cachedEntry) {
    return NextResponse.json(buildResponse(cachedEntry, true));
  }

  let lastError: unknown = null;
  const startedAt = Date.now();

  for (const feedUrl of GDACS_FEED_URLS) {
    try {
      const xml = await fetchGdacsFeed(feedUrl);
      const parsed = parseGdacsRss(xml);
      const events = deduplicateEvents(
        parsed.items
          .map(normalizeGdacsAlert)
          .filter((event): event is ArgusNormalizedEvent => event !== null)
      );

      if (events.length === 0) {
        throw new Error("GDACS no devolvió alertas georreferenciadas válidas.");
      }

      const cacheEntry = setCachedSource<GdacsCachedData>(
        SOURCE_CACHE_KEY,
        {
          events,
          sourceUpdatedAt: parsed.sourceUpdatedAt,
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
      lastError = error;
    }
  }

  const timedOut = lastError instanceof Error && lastError.name === "AbortError";
  const message = timedOut
    ? "La consulta a GDACS superó el tiempo de espera."
    : lastError instanceof Error
      ? lastError.message
      : "No fue posible consultar GDACS en este momento.";
  await recordIngestionRun(SOURCE_ID, "error", { error: message, durationMs: Date.now() - startedAt });
  return NextResponse.json(
    {
      error: message,
      sourceId: SOURCE_ID,
      sourceName: getArgusSource(SOURCE_ID)?.name ?? "GDACS Global Disaster Alerts",
      cached: false,
    },
    { status: timedOut ? 504 : 502 }
  );
}
