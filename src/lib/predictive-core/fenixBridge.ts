import type { ArgusDecisionPacket } from "@/types/predictiveCore";

export function createFenixSeedFromPrediction(packet: ArgusDecisionPacket) {
  if (!packet.fenixSeed) return null;

  return {
    scenarioId: `fenix-seed-${packet.analysis.inputId}`,
    lat: packet.fenixSeed.latitude,
    lng: packet.fenixSeed.longitude,
    crisisType: packet.fenixSeed.hazardType,
    severity: packet.fenixSeed.severity,
    confidence: packet.fenixSeed.confidence,
    sourceAnalysisId: packet.analysis.id,
    exploratory: packet.analysis.status !== "confirmed_by_official_source",
  };
}
