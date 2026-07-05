import type { EarthquakeOperationalImpactContext } from "@/types/earthquakeImpact";

export function buildUsgsEarthquakeMedicalContext(context: EarthquakeOperationalImpactContext) {
  return {
    sourceId: "usgs-earthquake-impact",
    medicalContext: "earthquake_estimated_medical_pressure_context",
    eventId: context.eventId,
    pagerAlert: context.pagerAlert,
    maxMmi: context.maxMmi,
    caveats: ["Does not confirm injuries, deaths, hospital availability or treatment needs.", "Use health authorities and facility status for operations."],
    evidenceRefs: context.evidenceRefs,
  };
}
