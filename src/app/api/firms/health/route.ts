import { NextResponse } from "next/server";
import { getCachedSource, setCachedSource } from "@/lib/ingestion/sourceCache";

/**
 * Diagnostico interno de NASA FIRMS: nunca expone el MAP_KEY, solo confirma
 * si esta configurado y si NASA responde. Hace una consulta real (area chica,
 * 1 dia) para distinguir "key ausente" de "key invalida/401" de "FIRMS caido".
 * El resultado se cachea brevemente para no gastar cuota de FIRMS cada vez
 * que alguien abre este endpoint.
 */

const SOURCE_ID = "nasa_firms";
const HEALTH_CACHE_KEY = "firms:health-check";
const HEALTH_CACHE_TTL_MS = 5 * 60_000;
const HEALTH_CHECK_BBOX = "-70.75,-33.65,-70.5,-33.35";
const HEALTH_CHECK_SOURCE = "VIIRS_SNPP_NRT";
const REQUEST_TIMEOUT_MS = 8_000;

type FirmsHealthStatus = "ok" | "unauthorized" | "rate_limited" | "unavailable" | "error";

interface FirmsHealthPayload {
  configured: boolean;
  status: FirmsHealthStatus;
  provider: "NASA FIRMS";
  lastChecked: string;
  message: string;
}

export const dynamic = "force-dynamic";

function payloadForStatus(httpStatus: number, now: string): FirmsHealthPayload {
  if (httpStatus === 401) {
    return {
      configured: true,
      status: "unauthorized",
      provider: "NASA FIRMS",
      lastChecked: now,
      message: "FIRMS no autorizado: revise NASA_FIRMS_MAP_KEY.",
    };
  }
  if (httpStatus === 403 || httpStatus === 429) {
    return {
      configured: true,
      status: "rate_limited",
      provider: "NASA FIRMS",
      lastChecked: now,
      message: "FIRMS bloqueado o límite alcanzado.",
    };
  }
  if (httpStatus >= 500) {
    return {
      configured: true,
      status: "unavailable",
      provider: "NASA FIRMS",
      lastChecked: now,
      message: "FIRMS temporalmente no disponible.",
    };
  }
  return {
    configured: true,
    status: "error",
    provider: "NASA FIRMS",
    lastChecked: now,
    message: `FIRMS respondió con estado ${httpStatus}.`,
  };
}

export async function GET() {
  const mapKey = process.env.NASA_FIRMS_MAP_KEY?.trim();
  const now = new Date().toISOString();

  if (!mapKey) {
    return NextResponse.json<FirmsHealthPayload>({
      configured: false,
      status: "error",
      provider: "NASA FIRMS",
      lastChecked: now,
      message: "FIRMS no configurado.",
    });
  }

  const cached = getCachedSource<FirmsHealthPayload>(HEALTH_CACHE_KEY);
  if (cached) {
    return NextResponse.json(cached.data);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let payload: FirmsHealthPayload;
  try {
    const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(mapKey)}/${HEALTH_CHECK_SOURCE}/${HEALTH_CHECK_BBOX}/1`;
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "text/csv",
        "User-Agent": `ARGUS-GRID/0.1 firms-health-check sourceId=${SOURCE_ID}`,
      },
      signal: controller.signal,
    });

    payload = response.ok
      ? {
          configured: true,
          status: "ok",
          provider: "NASA FIRMS",
          lastChecked: now,
          message: "FIRMS operativo.",
        }
      : payloadForStatus(response.status, now);
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    payload = {
      configured: true,
      status: "unavailable",
      provider: "NASA FIRMS",
      lastChecked: now,
      message: timedOut
        ? "FIRMS temporalmente no disponible (tiempo de espera agotado)."
        : "FIRMS temporalmente no disponible.",
    };
  } finally {
    clearTimeout(timeoutId);
  }

  setCachedSource(HEALTH_CACHE_KEY, payload, HEALTH_CACHE_TTL_MS);
  return NextResponse.json(payload);
}
