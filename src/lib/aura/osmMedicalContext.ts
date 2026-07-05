import { fetchAndBuildOsmCriticalInfrastructureContext, type OsmOverpassRequestParams } from "@/lib/knowledge-intake/adapters/osmOverpassAdapter";

export async function getOsmAuraMedicalContext(params: Pick<OsmOverpassRequestParams, "lat" | "lon" | "bbox" | "radiusKm" | "incidentId" | "persist">) {
  const result = await fetchAndBuildOsmCriticalInfrastructureContext({
    ...params,
    purpose: "aura_medical",
    radiusKm: params.radiusKm ?? 5,
    categories: ["medical_hospital", "medical_clinic", "medical_doctors", "medical_pharmacy", "medical_defibrillator", "medical_ambulance_station", "medical_helipad"],
    limit: 100,
    timeoutSeconds: 15,
  });
  return {
    status: result.status,
    nearbyMedicalContext: result.context?.medical ?? null,
    pois: result.context?.pois ?? [],
    evidenceRefs: result.context?.evidenceRefs ?? [],
    caveats: [
      "OpenStreetMap shows mapped medical services; ARGUS does not verify current operation, beds, ambulances or emergency availability.",
      "Mapped in OpenStreetMap must be verified with local emergency services before operational use.",
    ],
    warnings: result.warnings,
    errors: result.errors,
  };
}
