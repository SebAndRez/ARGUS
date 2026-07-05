import type { CriticalInfrastructureContext } from "@/types/osm";

export function buildOsmCriticalInfrastructureRiskContext(context: CriticalInfrastructureContext) {
  const medicalCount = ["medical_hospital", "medical_clinic", "medical_pharmacy", "medical_defibrillator"].reduce((sum, key) => sum + (context.countsByCategory[key] ?? 0), 0);
  const emergencyCount = ["emergency_fire_station", "emergency_police", "emergency_assembly_point", "shelter"].reduce((sum, key) => sum + (context.countsByCategory[key] ?? 0), 0);
  const logisticsCount = ["fuel", "charging_station", "drinking_water", "supermarket", "aerodrome", "port_harbour"].reduce((sum, key) => sum + (context.countsByCategory[key] ?? 0), 0);
  const bridgeTunnelCount = (context.countsByCategory.bridge ?? 0) + (context.countsByCategory.tunnel ?? 0);
  const riskFactors = [
    medicalCount ? "mapped_medical_services_nearby" : "no_mapped_medical_services_returned",
    emergencyCount ? "mapped_emergency_or_shelter_context_nearby" : "limited_mapped_emergency_context",
    logisticsCount ? "mapped_logistics_support_nearby" : "limited_mapped_logistics_context",
    bridgeTunnelCount ? "mapped_bridge_tunnel_exposure_context" : "no_bridge_tunnel_context_returned",
  ];
  return {
    criticalInfrastructureRiskContext: {
      nearbyMedicalAvailabilityContext: context.medical,
      emergencyServiceProximity: context.emergency,
      shelterContext: context.fenix.shelters,
      bridgeTunnelExposureContext: { bridges: context.nav.bridges, tunnels: context.nav.tunnels },
      logisticsContext: context.logistics,
      criticalInfrastructureDensity: context.pois.length,
      dataQualityCaveats: context.dataQualityCaveats,
      confidence: context.confidence,
    },
    riskFactors,
    recommendedReviewActions: [
      "Verify official facility status and availability with local authorities.",
      "Use OSM as nearby mapped infrastructure context, not as an official registry.",
      "Use a dedicated routing provider before route recommendations.",
    ],
    caveats: [
      "OpenStreetMap shows mapped hospitals/fire stations/shelters near this area.",
      "ARGUS identifies nearby mapped infrastructure that may support response.",
      "OSM is collaborative data; availability and official status must be verified.",
    ],
    evidenceRefs: context.evidenceRefs,
  };
}
