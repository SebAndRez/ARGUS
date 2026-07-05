import type { SeaLevelObservationContext } from "@/types/seaLevelObservation";

export function buildIocSeaLevelMedicalContext(context: SeaLevelObservationContext) {
  return {
    sourceId: "ioc-slsmf",
    sourceName: "IOC Sea Level Monitoring Facility",
    auraContext: "coastal_sea_level_rescue_context",
    stalenessMinutes: context.stalenessMinutes,
    operationalMedicalConsiderations: [
      "Coastal rescue access and evacuation timing may be affected by relative sea level observations and station freshness.",
      "Consider drowning, hypothermia, difficult access and delayed evacuation as informational planning factors.",
      "Use official responder and medical command sources for real triage or treatment decisions.",
    ],
    caveats: [
      "AURA does not diagnose, activate professional triage or issue medical orders from IOC SLSMF readings.",
      "Use this as medical-operational context only and validate with responders.",
    ],
    evidenceRefs: context.evidenceRefs,
  };
}
