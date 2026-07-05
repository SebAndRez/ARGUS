export function convertOraculoEvidenceToAuraMedicalSignals(evidence: Array<Record<string, unknown>>) {
  return evidence.map((item, index) => ({
    id: `aura-oraculo-${index}`,
    sourceId: String(item.id ?? index),
    topic: item.topic ?? "medical_capacity",
    confidence: item.verified ? "high" : "medium",
    requiresReview: Boolean(item.contradiction || item.isOld),
    personalMedicalDataIncluded: false,
  }));
}
