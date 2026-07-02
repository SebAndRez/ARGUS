import type { DemoSettlement } from "@/data/demoSettlements";
import type { FenixAffectedZone } from "@/types/fenixSimulation";

export function estimatePopulationFromKnownSettlements(settlements: DemoSettlement[]) {
  return settlements.reduce((sum, settlement) => sum + Math.round(settlement.population * 0.08), 0);
}

export function estimatePopulationFromDensity(zones: FenixAffectedZone[], densityPerKm2 = 850) {
  const largest = zones.at(-1);
  const area = Math.PI * Math.pow(largest?.radiusKm ?? 1, 2);
  return Math.round(area * densityPerKm2);
}

export function classifyExposureLevel(population: number) {
  if (population > 100000) return "critical" as const;
  if (population > 40000) return "high" as const;
  if (population > 10000) return "medium" as const;
  return "low" as const;
}

export function buildPopulationDisclaimer() {
  return "Estimación preliminar. Falta conexión con censo/fuente oficial.";
}

