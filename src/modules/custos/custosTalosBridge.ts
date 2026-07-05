export function convertTalosRiskToCustosOperationalContext(assessments: Array<Record<string, unknown>>) {
  return assessments.map((assessment, index) => ({ id: `custos-talos-${index}`, riskLevel: assessment.riskLevel, eventId: assessment.eventId, humanitarianSearchPriority: assessment.riskLevel === "critical" ? "high" : "medium", individualLocationIncluded: false }));
}
