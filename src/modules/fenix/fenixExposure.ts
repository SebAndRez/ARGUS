import type { FenixScenario } from "@/modules/fenix/types";

export function estimateFenixPopulationExposure(scenario: FenixScenario) {
  const population = scenario.inputs.estimatedPopulation;
  const radius = scenario.location.radiusMeters;
  const warnings = ["Estimacion agregada. No representa ubicacion individual de personas."];
  if (!population) warnings.push("Estimacion limitada por falta de datos de poblacion expuesta.");
  return {
    estimatedAffectedAreaKm2: radius ? Math.round((Math.PI * (radius / 1000) ** 2) * 10) / 10 : undefined,
    estimatedExposedPopulation: population ? Math.round(population * (scenario.inputs.talosRiskLevel === "high" ? 0.62 : 0.38)) : undefined,
    warnings,
  };
}
