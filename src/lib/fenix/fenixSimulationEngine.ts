import {
  demoFenixPopulation,
  demoFenixRoutes,
  demoFenixScenarios,
  demoFenixShelters,
} from "@/data/fenixDemo";
import type {
  FenixActionItem,
  FenixActionPlan,
  FenixInstitutionalAccessLevel,
  FenixRouteCollapsePrediction,
  FenixSimulationResult,
  FenixVehicleType,
} from "@/types/fenix";

const emergencyVehicles: FenixVehicleType[] = [
  "ambulance",
  "firetruck",
  "police",
  "military",
];

function routeScore(route: (typeof demoFenixRoutes)[number]) {
  const statusPenalty =
    route.status === "blocked"
      ? 1000
      : route.status === "critical"
        ? 80
        : route.status === "congested"
          ? 35
          : route.status === "emergency_only"
            ? 20
            : 0;
  const saturation = route.currentFlowPerHour / Math.max(1, route.capacityPerHour);
  return route.estimatedMinutes + route.exposureScore + statusPenalty + saturation * 30;
}

function buildCollapsePredictions(
  routes: typeof demoFenixRoutes
): FenixRouteCollapsePrediction[] {
  return routes.map((route) => {
    const saturation = route.currentFlowPerHour / Math.max(1, route.capacityPerHour);
    const collapseRisk =
      route.status === "blocked"
        ? 1
        : Math.min(0.98, saturation * 0.55 + route.exposureScore / 180);
    return {
      routeId: route.id,
      routeName: route.name,
      status: route.status,
      collapseRisk,
      estimatedMinutesToSaturation:
        collapseRisk >= 0.7 ? Math.max(10, Math.round((1 - Math.min(0.95, saturation)) * 90)) : undefined,
      reason:
        route.status === "blocked"
          ? "Ruta bloqueada en escenario demo."
          : collapseRisk >= 0.7
            ? "Flujo alto, capacidad limitada o exposicion elevada."
            : "Ruta estable bajo monitoreo.",
    };
  });
}

function buildActionPlan(
  scenarioId: string,
  predictions: FenixRouteCollapsePrediction[],
  shelters: typeof demoFenixShelters
): FenixActionPlan {
  const items: FenixActionItem[] = [];
  const criticalPrediction = predictions.find((prediction) => prediction.collapseRisk >= 0.7);
  if (criticalPrediction) {
    items.push({
      id: `fenix-action-route-${criticalPrediction.routeId}`,
      priority: "critical",
      title: "Descomprimir ruta critica",
      description: `Revisar desvio o gestion de flujo para ${criticalPrediction.routeName}.`,
      reason: criticalPrediction.reason,
      relatedEntityId: criticalPrediction.routeId,
      expectedImpact: "Reducir exposicion y saturacion operacional.",
      suggestedStatus: "requires_review",
    });
  }

  const nearCapacityShelter = shelters.find((shelter) => shelter.status === "near_capacity");
  if (nearCapacityShelter) {
    items.push({
      id: `fenix-action-shelter-${nearCapacityShelter.id}`,
      priority: "high",
      title: "Abrir refugio alternativo",
      description: `${nearCapacityShelter.name} esta cerca de capacidad en el demo.`,
      reason: "Evitar saturacion de refugio principal.",
      relatedEntityId: nearCapacityShelter.id,
      expectedImpact: "Distribuir llegada de personas evacuadas.",
      suggestedStatus: "activate_now",
    });
  }

  items.push({
    id: `fenix-action-public-${scenarioId}`,
    priority: "medium",
    title: "Actualizar instruccion publica",
    description: "Preparar mensaje simple para poblacion civil segun fuente oficial.",
    reason: "La vista publica debe evitar sobrecarga y no reemplazar autoridad.",
    expectedImpact: "Mejorar claridad y reducir exposicion innecesaria.",
    suggestedStatus: "monitor",
  });

  return {
    id: `fenix-plan-${scenarioId}`,
    scenarioId,
    generatedAt: new Date().toISOString(),
    items,
  };
}

export function runFenixSimulation(input: {
  scenarioId: string;
  vehicleType?: FenixVehicleType;
  accessLevel?: FenixInstitutionalAccessLevel;
}): FenixSimulationResult {
  const scenario =
    demoFenixScenarios.find((item) => item.id === input.scenarioId) ??
    demoFenixScenarios[0];
  const vehicleType = input.vehicleType ?? "car";
  const accessLevel = input.accessLevel ?? "public";
  const routes = demoFenixRoutes.filter((route) => route.scenarioId === scenario.id);
  const shelters = demoFenixShelters.filter((shelter) => shelter.scenarioId === scenario.id);
  const population = demoFenixPopulation.filter(
    (item) => item.scenarioId === scenario.id
  );

  const usableRoutes = routes.filter((route) => {
    if (route.status === "blocked") return false;
    if (route.status === "emergency_only" && !emergencyVehicles.includes(vehicleType)) {
      return accessLevel === "institutional" && emergencyVehicles.includes(vehicleType);
    }
    return route.allowedVehicles.includes(vehicleType);
  });
  const recommendedPublicRoute =
    usableRoutes.sort((left, right) => routeScore(left) - routeScore(right))[0] ??
    routes.find((route) => route.status !== "blocked");
  const recommendedShelter = shelters
    .filter((shelter) => shelter.status === "available" || shelter.status === "near_capacity")
    .sort((left, right) => left.currentOccupancy / left.capacity - right.currentOccupancy / right.capacity)[0];
  const predictions = buildCollapsePredictions(routes);
  const actionPlan = buildActionPlan(scenario.id, predictions, shelters);
  const totalExposedPopulation = population.reduce(
    (sum, item) => sum + item.estimatedPopulation,
    0
  );

  return {
    scenarioId: scenario.id,
    generatedAt: new Date().toISOString(),
    accessLevel,
    hazardType: scenario.hazardType,
    totalExposedPopulation,
    estimatedEvacuationTimeMinutes: Math.max(
      15,
      Math.round((recommendedPublicRoute?.estimatedMinutes ?? 30) * 1.35)
    ),
    recommendedPublicRoute,
    recommendedShelter,
    criticalRoutes: routes.filter((route) => route.status === "critical"),
    blockedRoutes: routes.filter((route) => route.status === "blocked"),
    collapsePredictions: predictions,
    shelterAnalysis: shelters,
    actionPlan,
    confidenceScore: Math.round(
      routes.reduce((sum, route) => sum + route.confidenceScore, 0) /
        Math.max(1, routes.length)
    ),
    publicInstruction: scenario.publicInstruction,
    summary:
      accessLevel === "institutional"
        ? "Simulacion demo institucional con rutas criticas, refugios y plan de accion."
        : "Vista publica demo con ruta/refugio recomendado e instruccion simple.",
  };
}
