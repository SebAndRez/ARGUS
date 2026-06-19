import { NextResponse } from "next/server";
import { normalizeUsGsEarthquake } from "@/lib/ingestion/normalizeUsGsEarthquake";
import type { UsgsEarthquakeFeatureCollection } from "@/types/ingestion";

const USGS_FEED_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson";
const REQUEST_TIMEOUT_MS = 8_000;

export const dynamic = "force-dynamic";

function toIsoDate(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function GET() {
  const controller = new AbortController();
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
          upstreamStatus: response.status,
        },
        { status: 502 }
      );
    }

    const payload = (await response.json()) as UsgsEarthquakeFeatureCollection;
    if (payload.type !== "FeatureCollection" || !Array.isArray(payload.features)) {
      return NextResponse.json(
        { error: "USGS devolvió un formato GeoJSON no reconocido." },
        { status: 502 }
      );
    }

    const events = payload.features
      .map(normalizeUsGsEarthquake)
      .filter((event) => event !== null);

    return NextResponse.json({
      source: "USGS Earthquake",
      count: events.length,
      generatedAt: toIsoDate(payload.metadata?.generated),
      events,
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return NextResponse.json(
      {
        error: timedOut
          ? "La consulta a USGS superó el tiempo de espera."
          : "No fue posible consultar USGS en este momento.",
      },
      { status: timedOut ? 504 : 502 }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
