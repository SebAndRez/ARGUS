import type { FenixScenario } from "@/modules/fenix/types";
import { generateFenixActionPlan } from "@/modules/fenix/fenixActionPlan";
import { calculateFenixScenarioConfidence } from "@/modules/fenix/fenixConfidence";
import { estimateFenixEvacuationDemand } from "@/modules/fenix/fenixEvacuation";
import { estimateFenixPopulationExposure } from "@/modules/fenix/fenixExposure";
import { calculateFenixMedicalImpact } from "@/modules/fenix/fenixMedicalImpact";
import { calculateFenixResourceDemand } from "@/modules/fenix/fenixResourceDemand";
import { calculateFenixRouteImpacts } from "@/modules/fenix/fenixRouteImpact";
import { calculateFenixShelterDemand } from "@/modules/fenix/fenixShelterDemand";

export function runFenixScenario(input: FenixScenario): FenixScenario {
  const exposure = estimateFenixPopulationExposure(input);
  const evacuation = estimateFenixEvacuationDemand(input);
  const confidence = calculateFenixScenarioConfidence(input);
  return {
    ...input,
    status: "completed",
    confidence: confidence.confidence,
    outputs: {
      estimatedAffectedAreaKm2: exposure.estimatedAffectedAreaKm2,
      estimatedExposedPopulation: exposure.estimatedExposedPopulation,
      estimatedEvacuationDemand: evacuation.estimatedEvacuationDemand,
      estimatedMedicalDemand: calculateFenixMedicalImpact(input)[0]?.estimatedDemand,
      estimatedShelterDemand: calculateFenixShelterDemand(input)[0]?.estimatedDemand,
      estimatedLogisticsDemand: calculateFenixResourceDemand(input).reduce((sum, item) => sum + (item.gapEstimate ?? 0), 0),
      routeImpacts: calculateFenixRouteImpacts(input),
      shelterImpacts: calculateFenixShelterDemand(input),
      resourceImpacts: calculateFenixResourceDemand(input),
      medicalImpacts: calculateFenixMedicalImpact(input),
      actionPlan: generateFenixActionPlan(input),
      warnings: [
        ...exposure.warnings.map((message, index) => ({ id: `${input.id}-exp-${index}`, severity: "medium" as const, message, sourceModule: "FENIX" })),
        ...confidence.negative.map((message, index) => ({ id: `${input.id}-conf-${index}`, severity: "medium" as const, message, sourceModule: "FENIX" })),
      ],
      generatedAt: new Date().toISOString(),
    },
    updatedAt: new Date().toISOString(),
  };
}
