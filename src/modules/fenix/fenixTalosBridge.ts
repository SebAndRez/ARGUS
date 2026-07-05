export function convertTalosAssessmentToFenixScenarioInput(assessment: Record<string, unknown>) {
  return { talosRiskLevel: String(assessment.riskLevel ?? "unknown"), category: assessment.category, confidence: assessment.confidence ?? "unknown", missingData: assessment.missingData ?? [] };
}
