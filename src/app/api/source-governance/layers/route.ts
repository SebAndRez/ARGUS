import { NextRequest, NextResponse } from "next/server";
import { filterMapLayersByMode, getAllMapLayerPolicies } from "@/lib/source-governance/mapLayerRegistry";
import type { MapLayerMode } from "@/lib/source-governance/mapLayerTaxonomy";

export const dynamic = "force-dynamic";

const MODES = new Set(["citizen", "command_center", "analyst", "fenix", "nav", "aura", "risk"]);

export async function GET(request: NextRequest) {
  const modeParam = request.nextUrl.searchParams.get("mode");
  const mode = MODES.has(modeParam ?? "") ? modeParam as MapLayerMode : undefined;
  const context = {
    hasActiveIncident: Boolean(request.nextUrl.searchParams.get("incidentId") || request.nextUrl.searchParams.get("activeIncident") === "true"),
    hasSelectedIncident: Boolean(request.nextUrl.searchParams.get("incidentId")),
    hasAoi: Boolean(request.nextUrl.searchParams.get("aoi") || request.nextUrl.searchParams.get("bbox") || request.nextUrl.searchParams.get("point")),
    hasBbox: Boolean(request.nextUrl.searchParams.get("bbox")),
    hasPoint: Boolean(request.nextUrl.searchParams.get("point")),
  };
  const layers = mode ? filterMapLayersByMode(mode, context) : getAllMapLayerPolicies();

  return NextResponse.json({
    status: "ok",
    mode: mode ?? "all",
    hazardType: request.nextUrl.searchParams.get("hazardType"),
    incidentId: request.nextUrl.searchParams.get("incidentId"),
    count: layers.length,
    layers,
  });
}
