import type { HydrologicalContext } from "@/types/hydrology";

export function buildUsgsWaterMedicalContext(context: HydrologicalContext) {
  return {
    sourceId: "usgs-water",
    sourceName: "USGS Water Data",
    auraContext: "flood_rescue_context",
    measuredAt: context.latest.measuredAt,
    stalenessMinutes: context.stalenessMinutes,
    operationalMedicalConsiderations: [
      "Possible flood or river rescue context near monitored water conditions.",
      "Consider drowning, hypothermia, contaminated water exposure and difficult access as informational planning factors.",
    ],
    caveats: [
      "AURA does not diagnose or activate professional triage from USGS Water readings.",
      "Use this as medical-operational context only and validate with responders.",
    ],
    evidenceRefs: context.evidenceRefs,
  };
}
