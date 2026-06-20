import { NextRequest, NextResponse } from "next/server";
import { getArgusSource } from "@/config/argusSourceRegistry";
import { normalizeMetWeather } from "@/lib/ingestion/normalizeMetWeather";
import {
  getCachedSource,
  setCachedSource,
  type CachedSourceEntry,
} from "@/lib/ingestion/sourceCache";
import type {
  MetNorwayLocationforecastResponse,
  MetWeatherSourceResponse,
  WeatherObservation,
} from "@/types/weatherRisk";

const SOURCE_ID = "met_norway";
const SOURCE_CACHE_PREFIX = `ingestion:${SOURCE_ID}:`;
const REQUEST_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 10 * 60_000;
const USER_AGENT =
  "ARGUS-GRID/0.1 contact: sebastian.andres.official@gmail.com";

interface MetCachedData {
  location: {
    latitude: number;
    longitude: number;
  };
  weather: WeatherObservation;
}

export const dynamic = "force-dynamic";

function roundCoordinate(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function buildResponse(
  entry: CachedSourceEntry<MetCachedData>,
  cached: boolean
): MetWeatherSourceResponse {
  return {
    sourceId: SOURCE_ID,
    sourceName:
      getArgusSource(SOURCE_ID)?.name ?? "MET Norway Locationforecast",
    cached,
    fetchedAt: entry.fetchedAt,
    expiresAt: entry.expiresAt,
    location: entry.data.location,
    weather: entry.data.weather,
  };
}

export async function GET(request: NextRequest) {
  const latitudeParam = request.nextUrl.searchParams.get("lat");
  const longitudeParam = request.nextUrl.searchParams.get("lon");
  const latitude = latitudeParam === null ? Number.NaN : Number(latitudeParam);
  const longitude =
    longitudeParam === null ? Number.NaN : Number(longitudeParam);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return NextResponse.json(
      {
        error:
          "Coordenadas inválidas. Use lat entre -90 y 90 y lon entre -180 y 180.",
        sourceId: SOURCE_ID,
      },
      { status: 400 }
    );
  }

  const location = {
    latitude: roundCoordinate(latitude),
    longitude: roundCoordinate(longitude),
  };
  const cacheKey = `${SOURCE_CACHE_PREFIX}${location.latitude.toFixed(4)},${location.longitude.toFixed(4)}`;
  const cachedEntry = getCachedSource<MetCachedData>(cacheKey);
  if (cachedEntry) {
    return NextResponse.json(buildResponse(cachedEntry, true));
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const url = new URL(
      "https://api.met.no/weatherapi/locationforecast/2.0/compact"
    );
    url.searchParams.set("lat", location.latitude.toFixed(4));
    url.searchParams.set("lon", location.longitude.toFixed(4));

    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `MET Norway respondió con estado ${response.status}.`,
          sourceId: SOURCE_ID,
          cached: false,
        },
        { status: 502 }
      );
    }

    const payload =
      (await response.json()) as MetNorwayLocationforecastResponse;
    const weather = normalizeMetWeather(payload, location);
    if (!weather) {
      return NextResponse.json(
        {
          error: "MET Norway no devolvió un punto horario utilizable.",
          sourceId: SOURCE_ID,
          cached: false,
        },
        { status: 502 }
      );
    }

    const cacheEntry = setCachedSource<MetCachedData>(
      cacheKey,
      { location, weather },
      CACHE_TTL_MS
    );

    return NextResponse.json(buildResponse(cacheEntry, false));
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return NextResponse.json(
      {
        error: timedOut
          ? "La consulta a MET Norway superó el tiempo de espera."
          : "No fue posible consultar MET Norway en este momento.",
        sourceId: SOURCE_ID,
        cached: false,
      },
      { status: timedOut ? 504 : 502 }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
