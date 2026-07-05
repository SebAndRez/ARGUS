import type { FenixScenario, FenixShelterImpact } from "@/modules/fenix/types";

export function calculateFenixShelterDemand(scenario: FenixScenario, arcaShelters: unknown[] = scenario.inputs.arcaShelters ?? []): FenixShelterImpact[] {
  const demand = scenario.inputs.estimatedPopulation ? Math.round(scenario.inputs.estimatedPopulation * 0.28) : undefined;
  if (!arcaShelters.length) {
    return [{ shelterName: "Refugios ARCA no cargados", estimatedDemand: demand, impactLevel: "medium", reason: "No hay capacidad ARCA suficiente para validar demanda." }];
  }
  return [
    { shelterName: "Refugio Central demo", estimatedDemand: demand, capacityStatus: "near_full", impactLevel: "high", reason: "Evaluar apertura de refugio alternativo ARCA por posible saturacion." },
    { shelterName: "Centro Deportivo demo", estimatedDemand: demand ? Math.round(demand * 0.45) : undefined, capacityStatus: "available", impactLevel: "medium", reason: "Preparar monitoreo de capacidad y servicios criticos." },
  ];
}
