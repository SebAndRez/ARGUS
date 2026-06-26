import { getMockRoutes } from "@/lib/routing/providers/mockRoutingProvider";
import type {
  ArgusNavRoute,
  ArgusRoutePlan,
  RouteEfficiencyScore,
  RouteHazard,
  RouteOptimizationMode,
  RouteRiskLevel,
  VehicleProfile,
} from "@/types/routing";

const severityWeight: Record<RouteRiskLevel, number> = {
  low: 8,
  medium: 18,
  high: 34,
  critical: 55,
};

function routeRiskWeight(level: RouteRiskLevel) {
  return severityWeight[level] ?? 20;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function vehicleRiskModifier(vehicleProfile: VehicleProfile) {
  if (["ambulance", "fire_truck", "rescue_team"].includes(vehicleProfile)) {
    return 0.85;
  }
  if (["truck", "aid_logistics"].includes(vehicleProfile)) return 1.18;
  if (vehicleProfile === "four_by_four") return 0.9;
  if (vehicleProfile === "pedestrian" || vehicleProfile === "bicycle") return 1.25;
  return 1;
}

function pickRiskLevel(score: number): RouteRiskLevel {
  if (score >= 75) return "critical";
  if (score >= 52) return "high";
  if (score >= 28) return "medium";
  return "low";
}

export function calculateRouteEfficiencyScore(
  route: ArgusNavRoute,
  vehicleProfile: VehicleProfile,
  hazards: RouteHazard[],
  optimizationMode: RouteOptimizationMode
): RouteEfficiencyScore {
  const hazardPenalty = hazards.reduce(
    (sum, hazard) => sum + severityWeight[hazard.severity] * (hazard.confidence / 100),
    0
  );
  const maneuverPenalty = route.turnPenalty.conflictTurnCount * 5 + route.stopPenalty.estimatedStops * 1.6;
  const distancePenalty = route.distanceKm * (optimizationMode === "shortest" ? 2.2 : 1.2);
  const exposurePenalty =
    optimizationMode === "low_exposure_route" || optimizationMode === "safest"
      ? hazardPenalty * 1.35
      : hazardPenalty;
  const fuelPenalty =
    optimizationMode === "low_fuel_route" || optimizationMode === "efficient_route"
      ? maneuverPenalty + distancePenalty
      : (maneuverPenalty + distancePenalty) * 0.7;
  const vehiclePenalty = vehicleRiskModifier(vehicleProfile) * 8;
  const totalPenalty = exposurePenalty + fuelPenalty + vehiclePenalty + routeRiskWeight(route.riskLevel);

  const fuelScore = clampScore(100 - fuelPenalty);
  const safetyScore = clampScore(100 - exposurePenalty - routeRiskWeight(route.riskLevel));
  const exposureScore = clampScore(100 - exposurePenalty);
  const maneuverScore = clampScore(100 - maneuverPenalty);
  const totalScore = clampScore(100 - totalPenalty / 2.2);

  return {
    fuelScore,
    safetyScore,
    exposureScore,
    maneuverScore,
    totalScore,
    explanation:
      "ARGUS pondera distancia, detenciones, giros conflictivos, exposicion a incidentes y tipo de vehiculo. Es un puntaje relativo de crisis, no consumo real.",
  };
}

export async function planArgusRoute(input: {
  origin: [number, number];
  destination: [number, number];
  vehicleProfile: VehicleProfile;
  hazards?: RouteHazard[];
  optimizationMode?: RouteOptimizationMode;
}): Promise<ArgusRoutePlan> {
  const optimizationMode = input.optimizationMode ?? "safest";
  const hazards = input.hazards ?? [];
  const routes = await getMockRoutes(input);
  const ranked = routes
    .map((route) => ({
      route,
      efficiency: calculateRouteEfficiencyScore(
        route,
        input.vehicleProfile,
        hazards,
        optimizationMode
      ),
    }))
    .sort((left, right) => right.efficiency.totalScore - left.efficiency.totalScore);

  const selected = ranked[0] ?? {
    route: routes[0],
    efficiency: calculateRouteEfficiencyScore(routes[0], input.vehicleProfile, hazards, optimizationMode),
  };

  const riskScore = 100 - selected.efficiency.safetyScore;

  return {
    mode: optimizationMode === "evacuation" ? "evacuation" : "normal",
    vehicleProfile: input.vehicleProfile,
    optimizationMode,
    recommendedRoute: {
      ...selected.route,
      riskLevel: pickRiskLevel(riskScore),
      optimizationMode,
    },
    alternativeRoutes: ranked.slice(1).map((item) => ({
      ...item.route,
      optimizationMode,
    })),
    riskLevel: pickRiskLevel(riskScore),
    efficiency: selected.efficiency,
    explanation:
      "Ruta seleccionada por menor exposicion operacional relativa, continuidad de avance y compatibilidad con el perfil indicado.",
  };
}
