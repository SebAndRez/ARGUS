import { NextRequest, NextResponse } from "next/server";
import {
  explainRunAllBlockedSources,
  getDefaultRunAllSources,
  getRunAllSourcesForFlags,
  type RunAllFlags,
} from "@/lib/source-governance/runAllPolicy";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const flags = parseFlags(request);
  const context = {
    hasAoi: request.nextUrl.searchParams.get("hasAoi") === "true",
    hasActiveIncident: request.nextUrl.searchParams.get("hasActiveIncident") === "true",
    hasSelectedIncident: request.nextUrl.searchParams.get("hasSelectedIncident") === "true",
    hasRoute: request.nextUrl.searchParams.get("hasRoute") === "true",
    hasSimulation: request.nextUrl.searchParams.get("hasSimulation") === "true",
  };
  return NextResponse.json({
    status: "ok",
    defaultSources: getDefaultRunAllSources(),
    sourcesForFlags: getRunAllSourcesForFlags(flags, context),
    blockedSources: explainRunAllBlockedSources(undefined, flags, context),
    flags,
    context,
    note: "Context, historical and OSINT sources are blocked by default and return reasons instead of fatal errors.",
  });
}

function parseFlags(request: NextRequest): RunAllFlags {
  const flags: RunAllFlags = {};
  for (const key of [
    "includeMediaSignals",
    "includeHistoricalImports",
    "includeInfrastructureContext",
    "includeHumanitarianContext",
    "includeWeatherContext",
    "includeAirQualityContext",
    "includeFloodForecastContext",
    "includeObservedFloodContext",
    "includeVehicleContext",
    "includeVolcanoMemory",
    "includeEarthquakeImpact",
    "includeHealthContext",
    "includeCoastalOceanContext",
  ] as const) {
    flags[key] = request.nextUrl.searchParams.get(key) === "true";
  }
  return flags;
}
