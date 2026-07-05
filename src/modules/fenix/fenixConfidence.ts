import type { FenixConfidence, FenixScenario } from "@/modules/fenix/types";

export function calculateFenixScenarioConfidence(scenario: FenixScenario): { confidence: FenixConfidence; positive: string[]; negative: string[] } {
  const positive: string[] = [];
  const negative: string[] = [];
  if (scenario.inputs.talosRiskLevel) positive.push("TALOS aporta nivel de riesgo.");
  if (scenario.inputs.hermesRoutes?.length) positive.push("HERMES aporta rutas candidatas.");
  if (scenario.inputs.arcaShelters?.length) positive.push("ARCA aporta refugios/capacidad.");
  if (scenario.inputs.oraculoEvidence?.length) positive.push("ORACULO aporta evidencia.");
  if (!scenario.inputs.estimatedPopulation) negative.push("Falta poblacion expuesta validada.");
  if (!scenario.inputs.hermesRoutes?.length) negative.push("Faltan rutas HERMES confirmadas.");
  if (scenario.assumptions.some((item) => item.sourceModule === "MANUAL" && item.confidence === "low")) negative.push("Supuestos manuales de baja confianza.");
  const score = positive.length - negative.length;
  return { confidence: score >= 3 ? "high" : score >= 1 ? "medium" : "low", positive, negative };
}
