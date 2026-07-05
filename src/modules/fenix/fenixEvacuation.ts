import type { FenixScenario } from "@/modules/fenix/types";
import { estimateFenixPopulationExposure } from "@/modules/fenix/fenixExposure";

export function estimateFenixEvacuationDemand(scenario: FenixScenario) {
  const exposure = estimateFenixPopulationExposure(scenario);
  const demand = exposure.estimatedExposedPopulation ? Math.round(exposure.estimatedExposedPopulation * 0.72) : undefined;
  return {
    estimatedEvacuationDemand: demand,
    evacuationWindowMinutes: scenario.inputs.evacuationWindowMinutes,
    strainedRoutes: scenario.inputs.hermesRoutes?.length ? ["Ruta Norte demo"] : [],
    zonesWithoutAlternative: scenario.inputs.mobilityConstraints?.length ? ["Sector con alternativa pendiente"] : [],
    warning: "Escenario estimado; requiere validacion operacional.",
  };
}
