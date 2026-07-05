import type { HermesBlockage, HermesGeoPoint, HermesNexusSignal, HermesRiskZone } from "@/modules/hermes/types";
import { calculateHermesRoutes } from "@/modules/hermes/hermesRouting";

/**
 * NEXUS todavía no existe como módulo completo; este puente solo define la
 * forma mínima de un destino logístico, sin implementar inventario real.
 */
export interface HermesLogisticsTargetInput {
  id: string;
  name: string;
  location: HermesGeoPoint;
  probableResources?: string[];
}

export async function prepareHermesLogisticsRoutes(
  logisticsTargets: HermesLogisticsTargetInput[],
  origin: HermesGeoPoint,
  context: { blockages?: HermesBlockage[]; riskZones?: HermesRiskZone[]; priority?: "low" | "medium" | "high" | "critical" } = {}
): Promise<HermesNexusSignal[]> {
  const priority = context.priority ?? "medium";
  const results = await Promise.all(
    logisticsTargets.map(async (target) => {
      const routes = await calculateHermesRoutes({
        origin,
        destination: target.location,
        mobilityMode: "logistics_truck",
        purpose: "logistics_delivery",
        blockages: context.blockages,
        riskZones: context.riskZones,
      });
      const best = routes[0];
      return {
        routeId: best.id,
        logisticsPriority: priority,
        routesAffected: best.status === "blocked" || best.status === "high_risk",
        probableResources: target.probableResources ?? [],
        approximateZone: target.location,
      } satisfies HermesNexusSignal;
    })
  );
  return results;
}
