export function convertOraculoEvidenceToFenixEvidenceInputs(evidence: unknown[], contradictions: unknown[] = []) {
  return { evidence, contradictions, confidence: evidence.length ? "medium" : "low" };
}
