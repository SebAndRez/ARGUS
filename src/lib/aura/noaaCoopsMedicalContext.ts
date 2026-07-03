import type { CoastalObservationContext } from "@/types/coastalObservation";

export function buildNoaaCoopsMedicalContext(context: CoastalObservationContext) {
  return {
    sourceId: "noaa-coops",
    sourceName: "NOAA CO-OPS",
    auraContext: "coastal_rescue_context",
    stalenessMinutes: context.stalenessMinutes,
    operationalMedicalConsiderations: [
      "Coastal rescue access and timing may be affected by tide stage, water level, wind and port context.",
      "Consider drowning, hypothermia, difficult access and delayed evacuation as informational planning factors.",
      "Currents, visibility and water temperature are reserved for later source phases.",
    ],
    caveats: [
      "AURA does not diagnose, activate professional triage or issue medical orders from NOAA CO-OPS readings.",
      "Use this as medical-operational context only and validate with responders.",
    ],
    evidenceRefs: context.evidenceRefs,
  };
}
