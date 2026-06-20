import { NextRequest, NextResponse } from "next/server";
import { getArgusSource } from "@/config/argusSourceRegistry";
import { deduplicateEvents } from "@/lib/ingestion/deduplicateEvents";
import {
  normalizeNasaFirms,
  parseNasaFirmsCsv,
} from "@/lib/ingestion/normalizeNasaFirms";
import {
  getCachedSource,
  setCachedSource,
  type CachedSourceEntry,
} from "@/lib/ingestion/sourceCache";
import type {
  ArgusIngestionSourceResponse,
  ArgusNormalizedEvent,
} from "@/types/ingestion";

const SOURCE_ID = "nasa_firms";
const SOURCE_CACHE_PREFIX = `ingestion:${SOURCE_ID}:`;
const REQUEST_TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 15 * 60_000;
const DEFAULT_BBOX = [-76, -56, -66, -17] as const;
const DEFAULT_SOURCE = "VIIRS_SNPP_NRT";
const ALLOWED_SOURCES = new Set([
  "VIIRS_SNPP_NRT",
  "VIIRS_NOAA20_NRT",
  "VIIRS_NOAA21_NRT",
  "MODIS_NRT",
]);

interface FirmsCachedData {
  events: ArgusNormalizedEvent[];
  sourceUpdatedAt: string | null;
}

export const dynamic = "force-dynamic";

function buildResponse(
  entry: CachedSourceEntry<FirmsCachedData>,
  cached: boolean
): ArgusIngestionSourceResponse {
  return {
    sourceId: SOURCE_ID,
    sourceName: getArgusSource(SOURCE_ID)?.name ?? "NASA FIRMS",
    cached,
    fetchedAt: entry.fetchedAt,
    expiresAt: entry.expiresAt,
    sourceUpdatedAt: entry.data.sourceUpdatedAt,
    count: entry.data.events.length,
    events: entry.data.events,
  };
}

function parseBoundingBox(value: string | null) {
  if (!value) return [...DEFAULT_BBOX];
  const coordinates = value.split(",").map(Number);
  if (
    coordinates.length !== 4 ||
    coordinates.some((coordinate) => !Number.isFinite(coordinate))
  ) {
    return null;
  }

  const [west, south, east, north] = coordinates;
  if (
    west < -180 ||
    east > 180 ||
    south < -90 ||
    north > 90 ||
    west >= east ||
    south >= north
  ) {
    return null;
  }

  return coordinates;
}

export async function GET(request: NextRequest) {
  const mapKey = process.env.NASA_FIRMS_MAP_KEY?.trim();
  if (!mapKey) {
    return NextResponse.json(
      {
        disabled: true,
        reason: "NASA_FIRMS_MAP_KEY missing",
        sourceId: SOURCE_ID,
        sourceName: getArgusSource(SOURCE_ID)?.name ?? "NASA FIRMS",
      },
      { status: 503 }
    );
  }

  const boundingBox = parseBoundingBox(
    request.nextUrl.searchParams.get("bbox")
  );
  const days = Number(request.nextUrl.searchParams.get("days") ?? "1");
  const source =
    request.nextUrl.searchParams.get("source")?.trim().toUpperCase() ??
    DEFAULT_SOURCE;

  if (!boundingBox) {
    return NextResponse.json(
      { error: "bbox inválido. Use west,south,east,north.", sourceId: SOURCE_ID },
      { status: 400 }
    );
  }
  if (!Number.isInteger(days) || days < 1 || days > 5) {
    return NextResponse.json(
      { error: "days debe ser un entero entre 1 y 5.", sourceId: SOURCE_ID },
      { status: 400 }
    );
  }
  if (!ALLOWED_SOURCES.has(source)) {
    return NextResponse.json(
      { error: "Fuente FIRMS no soportada.", sourceId: SOURCE_ID },
      { status: 400 }
    );
  }

  const bboxLabel = boundingBox.join(",");
  const cacheKey = `${SOURCE_CACHE_PREFIX}${source}:${bboxLabel}:${days}`;
  const cachedEntry = getCachedSource<FirmsCachedData>(cacheKey);
  if (cachedEntry) {
    return NextResponse.json(buildResponse(cachedEntry, true));
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(mapKey)}/${source}/${bboxLabel}/${days}`;
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "text/csv",
        "User-Agent": "ARGUS-GRID/0.1 external-data-ingestion",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `NASA FIRMS respondió con estado ${response.status}.`,
          sourceId: SOURCE_ID,
          cached: false,
        },
        { status: 502 }
      );
    }

    const csv = await response.text();
    const header = csv.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0]?.toLowerCase() ?? "";
    if (
      !header.includes("latitude") ||
      !header.includes("longitude") ||
      !header.includes("acq_date")
    ) {
      return NextResponse.json(
        {
          error: "NASA FIRMS devolvió una respuesta CSV no reconocida.",
          sourceId: SOURCE_ID,
          cached: false,
        },
        { status: 502 }
      );
    }

    const rows = parseNasaFirmsCsv(csv);
    const events = deduplicateEvents(
      rows
        .map(normalizeNasaFirms)
        .filter((event): event is ArgusNormalizedEvent => event !== null)
    );
    const sourceUpdatedAt = events[0]?.occurredAt ?? null;
    const cacheEntry = setCachedSource<FirmsCachedData>(
      cacheKey,
      { events, sourceUpdatedAt },
      CACHE_TTL_MS
    );

    return NextResponse.json(buildResponse(cacheEntry, false));
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return NextResponse.json(
      {
        error: timedOut
          ? "La consulta a NASA FIRMS superó el tiempo de espera."
          : "No fue posible consultar NASA FIRMS en este momento.",
        sourceId: SOURCE_ID,
        cached: false,
      },
      { status: timedOut ? 504 : 502 }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
