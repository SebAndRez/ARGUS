import type { FenixScenario } from "@/modules/fenix/types";

export function getFenixAtlasSummary(scenarios: FenixScenario[]) {
  const completed = scenarios.filter((scenario) => scenario.status === "completed");
  return {
    activeScenarios: scenarios.filter((scenario) => ["ready", "running", "requires_review"].includes(scenario.status)).length,
    criticalScenarios: scenarios.filter((scenario) => scenario.inputs.talosRiskLevel === "critical" || scenario.inputs.talosRiskLevel === "high").length,
    routesAtRisk: completed.flatMap((scenario) => scenario.outputs?.routeImpacts ?? []).filter((route) => route.impactLevel === "high" || route.impactLevel === "critical").length,
    sheltersUnderPressure: completed.flatMap((scenario) => scenario.outputs?.shelterImpacts ?? []).filter((shelter) => shelter.impactLevel === "high").length,
    logisticsGaps: completed.flatMap((scenario) => scenario.outputs?.resourceImpacts ?? []).filter((resource) => (resource.gapEstimate ?? 0) > 0).length,
    medicalPressure: completed.flatMap((scenario) => scenario.outputs?.medicalImpacts ?? []).filter((medical) => medical.impactLevel !== "low").length,
    confidenceAverage: "medium",
    suggestedActions: completed.flatMap((scenario) => scenario.outputs?.actionPlan ?? []).slice(0, 5),
    lastUpdated: scenarios.map((scenario) => scenario.updatedAt).sort().at(-1) ?? null,
  };
}
