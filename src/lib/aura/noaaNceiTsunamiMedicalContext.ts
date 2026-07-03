import type { NoaaNceiTsunamiEvent, NoaaNceiTsunamiRunup } from "@/lib/knowledge-intake/adapters/noaaNceiTsunamiAdapter";

export function buildNoaaNceiTsunamiMedicalContext(event?: NoaaNceiTsunamiEvent, runups: NoaaNceiTsunamiRunup[] = []) {
  return {
    sourceId: "noaa-ncei-tsunami",
    sourceName: "NOAA NCEI/WDS Global Historical Tsunami Database",
    auraContext: "historical_tsunami_medical_context",
    tsunamiEventId: event?.tsunamiEventId,
    historicalImpactContext: {
      deaths: event?.deaths ?? runups.reduce((sum, runup) => sum + (runup.deaths ?? 0), 0),
      injuries: event?.injuries ?? runups.reduce((sum, runup) => sum + (runup.injuries ?? 0), 0),
      highestRunup: Math.max(event?.maxWaterHeight ?? 0, ...runups.map((runup) => runup.maxWaterHeight ?? 0)),
    },
    operationalMedicalConsiderations: [
      "Drowning and near-drowning historical context.",
      "Hypothermia, trauma, entrapment and contaminated water exposure can be planning considerations.",
      "Loss of housing and vulnerable populations may require review in historical impact analysis.",
    ],
    caveats: [
      "AURA does not diagnose, activate professional triage or issue medical orders from historical tsunami data.",
      "This is medical-operational historical context only and requires responder validation.",
      "This is historical context, not a live warning.",
    ],
    evidenceRefs: [event?.tsunamiEventId, ...runups.map((runup) => `${runup.tsunamiEventId}:${runup.runupId}`)].filter(Boolean),
  };
}
