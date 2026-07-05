import { fetchAndBuildOsmCriticalInfrastructureContext, type OsmOverpassRequestParams } from "@/lib/knowledge-intake/adapters/osmOverpassAdapter";

export async function getOsmNavRouteContext(params: Pick<OsmOverpassRequestParams, "lat" | "lon" | "bbox" | "radiusKm" | "routeAnalysisId" | "incidentId" | "persist">) {
  const result = await fetchAndBuildOsmCriticalInfrastructureContext({
    ...params,
    purpose: "nav_route_context",
    radiusKm: params.radiusKm ?? 5,
    categories: ["road", "bridge", "tunnel", "ford", "barrier", "fuel", "charging_station"],
    limit: 150,
    timeoutSeconds: 15,
    geometryMode: "centroid",
  });
  return {
    status: result.status,
    navContext: result.context?.nav ?? null,
    roadContext: result.context?.nav.roadContext ?? [],
    bridges: result.context?.nav.bridges ?? [],
    tunnels: result.context?.nav.tunnels ?? [],
    fuelStations: result.context?.nav.fuelStations ?? [],
    chargingStations: result.context?.nav.chargingStations ?? [],
    evidenceRefs: result.context?.evidenceRefs ?? [],
    caveats: [
      "Overpass is not a routing engine and does not calculate routes in this phase.",
      "OSM road context is not official live traffic or official route closure data.",
      "Routing engines such as OSRM, Valhalla, GraphHopper or ORS remain phase 2 integrations.",
    ],
    warnings: result.warnings,
    errors: result.errors,
  };
}
