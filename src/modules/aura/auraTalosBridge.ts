export function convertTalosAssessmentsToAuraMedicalSignals(assessments: Array<Record<string, unknown>>) {
  return assessments.map((assessment, index) => ({
    id: `aura-talos-${index}`,
    sourceAssessmentId: String(assessment.id ?? index),
    impact: String(assessment.impact ?? assessment.riskLevel ?? "unknown"),
    priority: String(assessment.riskLevel ?? "").toLowerCase().includes("critical") ? "critical" : "medium",
    warning: assessment.confidence === "low" ? "Baja confianza TALOS; requiere revision." : undefined,
  }));
}
