import { NextResponse } from "next/server";
import { getArgusSource } from "@/config/argusSourceRegistry";
import { deduplicateEvents } from "@/lib/ingestion/deduplicateEvents";
import {
  normalizeNoaaTsunami,
  parseNoaaTsunamiAtom,
} from "@/lib/ingestion/normalizeNoaaTsunami";
import { persistFreshIngestion } from "@/lib/ingestion/persistExternalEvents";
import {
  getCachedSource,
  setCachedSource,
  type CachedSourceEntry,
} from "@/lib/ingestion/sourceCache";
import type {
  ArgusIngestionSourceResponse,
  ArgusNormalizedEvent,
} from "@/types/ingestion";

const SOURCE_ID = "noaa_tsunami";
const SOURCE_CACHE_KEY = `ingestion:${SOURCE_ID}`;
const NOAA_FEED_URLS = [
  "https://www.tsunami.gov/events/xml/PAAQAtom.xml",
  "https://www.tsunami.gov/events/xml/PHEBAtom.xml",
];
const REQUEST_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 5 * 60_000;

interface NoaaTsunamiCachedData {
  events: ArgusNormalizedEvent[];
  sourceUpdatedAt: string | null;
}

export const dynamic = "force-dynamic";

function buildResponse(
  entry: CachedSourceEntry<NoaaTsunamiCachedData>,
  cached: boolean
): ArgusIngestionSourceResponse {
  const source = getArgusSource(SOURCE_ID);

  return {
    cached,
    fetchedAt: entry.fetchedAt,
    expiresAt: entry.expiresAt,
    sourceId: SOURCE_ID,
    sourceName: source?.name ?? "NOAA Tsunami",
    sourceUpdatedAt: entry.data.sourceUpdatedAt,
    count: entry.data.events.length,
    events: entry.data.events,
  };
}

async function fetchNoaaFeed(url: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/atom+xml, application/xml, text/xml",
        "User-Agent": "ARGUS-GRID/0.1 external-data-ingestion",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`NOAA Tsunami respondió con estado ${response.status}.`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function GET() {
  const cachedEntry =
    getCachedSource<NoaaTsunamiCachedData>(SOURCE_CACHE_KEY);
  if (cachedEntry) {
    return NextResponse.json(buildResponse(cachedEntry, true));
  }

  const results = await Promise.allSettled(
    NOAA_FEED_URLS.map(async (feedUrl) => {
      const xml = await fetchNoaaFeed(feedUrl);
      return parseNoaaTsunamiAtom(xml);
    })
  );
  const startedAt = Date.now();
  const successfulFeeds = results
    .filter(
      (
        result
      ): result is PromiseFulfilledResult<
        ReturnType<typeof parseNoaaTsunamiAtom>
      > => result.status === "fulfilled"
    )
    .map((result) => result.value);

  if (successfulFeeds.length === 0) {
    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );
    const timedOut =
      failure?.reason instanceof Error && failure.reason.name === "AbortError";

    return NextResponse.json(
      {
        error: timedOut
          ? "La consulta a NOAA Tsunami superó el tiempo de espera."
          : failure?.reason instanceof Error
            ? failure.reason.message
            : "No fue posible consultar NOAA Tsunami en este momento.",
        sourceId: SOURCE_ID,
        sourceName: getArgusSource(SOURCE_ID)?.name ?? "NOAA Tsunami",
        cached: false,
      },
      { status: timedOut ? 504 : 502 }
    );
  }

  const events = deduplicateEvents(
    successfulFeeds
      .flatMap((feed) => feed.entries)
      .map(normalizeNoaaTsunami)
      .filter((event): event is ArgusNormalizedEvent => event !== null)
  );
  const sourceUpdatedAt =
    successfulFeeds
      .map((feed) => feed.sourceUpdatedAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;
  const cacheEntry = setCachedSource<NoaaTsunamiCachedData>(
    SOURCE_CACHE_KEY,
    {
      events,
      sourceUpdatedAt,
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
}
