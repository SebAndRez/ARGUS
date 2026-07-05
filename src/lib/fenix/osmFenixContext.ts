import { fetchAndBuildOsmCriticalInfrastructureContext, type OsmOverpassRequestParams } from "@/lib/knowledge-intake/adapters/osmOverpassAdapter";

export async function getOsmFenixContext(params: Pick<OsmOverpassRequestParams, "lat" | "lon" | "bbox" | "radiusKm" | "incidentId" | "fenixSimulationId" | "persist"> & { exposure?: boolean }) {
  const result = await fetchAndBuildOsmCriticalInfrastructureContext({
    ...params,
    purpose: params.exposure ? "fenix_exposure" : "fenix_shelter",
    radiusKm: params.radiusKm ?? 10,
    categories: params.exposure
      ? ["shelter", "emergency_assembly_point", "school", "community_centre", "bridge", "tunnel", "buildings"]
      : ["shelter", "emergency_assembly_point", "school", "community_centre", "sports_centre", "camp_site"],
    limit: 120,
    timeoutSeconds: 15,
  });
  return {
    status: result.status,
    fenixContext: result.context?.fenix ?? null,
    mappedShelters: result.context?.fenix.shelters ?? [],
    candidateFacilities: [
      ...(result.context?.fenix.schools ?? []),
      ...(result.context?.fenix.communityCentres ?? []),
    ],
    bridges: result.context?.nav.bridges ?? [],
    tunnels: result.context?.nav.tunnels ?? [],
    evidenceRefs: result.context?.evidenceRefs ?? [],
    caveats: [
      "Mapped shelters are not official or open unless confirmed by an authority.",
      "Candidate facilities and buildings are simulation context only; no capacity is inferred from OSM.",
    ],
    warnings: result.warnings,
    errors: result.errors,
  };
}
