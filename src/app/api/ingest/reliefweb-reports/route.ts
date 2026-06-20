import { NextRequest, NextResponse } from "next/server";
import { getArgusSource } from "@/config/argusSourceRegistry";
import { deduplicateEvents } from "@/lib/ingestion/deduplicateEvents";
import { normalizeReliefWebReport } from "@/lib/ingestion/normalizeReliefWebReport";
import {
  persistExternalEvents,
  recordIngestionRun,
} from "@/lib/ingestion/persistExternalEvents";
import {
  getCachedSource,
  setCachedSource,
  type CachedSourceEntry,
} from "@/lib/ingestion/sourceCache";
import type {
  ArgusIngestionSourceResponse,
  ArgusNormalizedEvent,
  ReliefWebReportItem,
} from "@/types/ingestion";

const SOURCE_ID = "reliefweb";
const SOURCE_CACHE_PREFIX = `ingestion:${SOURCE_ID}:`;
const REQUEST_TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 10 * 60_000;

interface ReliefWebCachedData {
  events: ArgusNormalizedEvent[];
  sourceUpdatedAt: string | null;
}

interface ReliefWebResponse {
  data?: ReliefWebReportItem[];
}

export const dynamic = "force-dynamic";

function buildResponse(
  entry: CachedSourceEntry<ReliefWebCachedData>,
  cached: boolean,
  persistence?: { persistedCount?: number; ingestionRunId?: string | null }
): ArgusIngestionSourceResponse & {
  persistedCount?: number;
  ingestionRunId?: string | null;
} {
  return {
    sourceId: SOURCE_ID,
    sourceName: getArgusSource(SOURCE_ID)?.name ?? "ReliefWeb",
    cached,
    fetchedAt: entry.fetchedAt,
    expiresAt: entry.expiresAt,
    sourceUpdatedAt: entry.data.sourceUpdatedAt,
    count: entry.data.events.length,
    events: entry.data.events,
    ...persistence,
  };
}

export async function GET(request: NextRequest) {
  const appName = process.env.RELIEFWEB_APP_NAME?.trim();
  if (!appName) {
    return NextResponse.json(
      {
        disabled: true,
        reason: "RELIEFWEB_APP_NAME missing",
        sourceId: SOURCE_ID,
        sourceName: getArgusSource(SOURCE_ID)?.name ?? "ReliefWeb",
      },
      { status: 503 }
    );
  }

  const limitValue = Number(request.nextUrl.searchParams.get("limit") ?? "10");
  const limit = Number.isInteger(limitValue)
    ? Math.min(50, Math.max(1, limitValue))
    : 10;
  const query = request.nextUrl.searchParams.get("query")?.trim() ?? "";
  const country = request.nextUrl.searchParams.get("country")?.trim() ?? "";
  const disaster = request.nextUrl.searchParams.get("disaster")?.trim() ?? "";
  const cacheKey = `${SOURCE_CACHE_PREFIX}${limit}:${query}:${country}:${disaster}`;
  const cachedEntry = getCachedSource<ReliefWebCachedData>(cacheKey);
  if (cachedEntry) {
    return NextResponse.json(buildResponse(cachedEntry, true));
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const url = new URL("https://api.reliefweb.int/v2/reports");
    url.searchParams.set("appname", appName);
    const filters = [
      country ? { field: "country.name", value: country } : null,
      disaster ? { field: "disaster.name", value: disaster } : null,
    ].filter(Boolean);
    const response = await fetch(url, {
      method: "POST",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        limit,
        sort: ["date.created:desc"],
        profile: "full",
        fields: {
          include: [
            "title",
            "url",
            "date",
            "source",
            "country",
            "disaster",
            "format",
            "body",
            "body-html",
          ],
        },
        ...(query ? { query: { value: query } } : {}),
        ...(filters.length > 0
          ? { filter: { operator: "AND", conditions: filters } }
          : {}),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`ReliefWeb respondió con estado ${response.status}.`);
    }

    const payload = (await response.json()) as ReliefWebResponse;
    const events = deduplicateEvents(
      (payload.data ?? [])
        .map(normalizeReliefWebReport)
        .filter((event): event is ArgusNormalizedEvent => event !== null)
    );
    const sourceUpdatedAt = events[0]?.occurredAt ?? null;
    const cacheEntry = setCachedSource<ReliefWebCachedData>(
      cacheKey,
      { events, sourceUpdatedAt },
      CACHE_TTL_MS
    );
    const persistence = await persistExternalEvents(SOURCE_ID, events, {
      fetchedAt: cacheEntry.fetchedAt,
      expiresAt: cacheEntry.expiresAt,
    });
    const run = await recordIngestionRun(SOURCE_ID, "success", {
      count: events.length,
      cached: false,
      durationMs: Date.now() - startedAt,
      metadata: { persistedCount: persistence.persistedCount },
    });

    return NextResponse.json(
      buildResponse(cacheEntry, false, {
        persistedCount: persistence.persistedCount,
        ingestionRunId: run?.id ?? null,
      })
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.name === "AbortError"
          ? "La consulta a ReliefWeb superó el tiempo de espera."
          : error.message
        : "No fue posible consultar ReliefWeb.";
    await recordIngestionRun(SOURCE_ID, "error", {
      error: message,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(
      {
        error: message,
        sourceId: SOURCE_ID,
        sourceName: getArgusSource(SOURCE_ID)?.name ?? "ReliefWeb",
        cached: false,
      },
      { status: error instanceof Error && error.name === "AbortError" ? 504 : 502 }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
