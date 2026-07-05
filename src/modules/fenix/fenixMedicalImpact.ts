import type { FenixMedicalImpact, FenixScenario } from "@/modules/fenix/types";

export function calculateFenixMedicalImpact(scenario: FenixScenario): FenixMedicalImpact[] {
  const demand = scenario.inputs.estimatedPopulation ? Math.round(scenario.inputs.estimatedPopulation * 0.04) : undefined;
  return [
    { medicalPointName: "Hospital Base demo", estimatedDemand: demand, capacityStatus: "limited", impactLevel: scenario.type === "mass_casualty" ? "critical" : "medium", reason: "Revisar capacidad AURA y transporte sanitario agregado." },
  ];
}
