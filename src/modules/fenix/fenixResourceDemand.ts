import type { FenixResourceImpact, FenixScenario } from "@/modules/fenix/types";

export function calculateFenixResourceDemand(scenario: FenixScenario): FenixResourceImpact[] {
  const base = scenario.inputs.estimatedPopulation ?? 0;
  return [
    { category: "water", estimatedDemand: base ? Math.round(base * 2) : undefined, availableEstimate: 1200, gapEstimate: base ? Math.max(0, Math.round(base * 2 - 1200)) : undefined, impactLevel: "high", reason: "Preparar agua para poblacion evacuada estimada." },
    { category: "fuel", estimatedDemand: 500, availableEstimate: 260, gapEstimate: 240, impactLevel: "medium", reason: "Evaluar combustible para rutas y generadores." },
    { category: "blankets", estimatedDemand: base ? Math.round(base * 0.35) : undefined, impactLevel: "medium", reason: "Preparar suministros NEXUS segun demanda de refugio." },
  ];
}
