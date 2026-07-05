export function convertOraculoEvidenceToCustosContext(evidence: Array<Record<string, unknown>>) {
  return evidence.map((item, index) => ({ id: `custos-oraculo-${index}`, evidenceId: item.id, confidence: item.verified ? "high" : "medium", requiresInstitutionalValidation: true }));
}
