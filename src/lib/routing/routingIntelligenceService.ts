import { demoRoutingRoutes } from "@/data/routingIntelligenceDemo";

export function getOperationalRoutesForScenario(scenarioId?: string) {
  if (!scenarioId) return demoRoutingRoutes;

  if (scenarioId.includes("tsunami")) {
    return demoRoutingRoutes.filter((route) => route.status !== "blocked");
  }

  return demoRoutingRoutes;
}

export function analyzeRouteOperationalStatus(routeId: string) {
  const route = demoRoutingRoutes.find((item) => item.id === routeId);
  if (!route) return null;

  const saturationRatio =
    route.currentFlowPerHour / Math.max(1, route.estimatedCapacityPerHour);

  return {
    routeId,
    status: route.status,
    saturationRatio,
    collapseRisk: Math.min(1, saturationRatio * (route.riskLevel === "critical" ? 1.15 : 0.85)),
    explanation:
      saturationRatio >= 1
        ? "Flujo actual supera capacidad estimada."
        : "Ruta bajo capacidad estimada, mantener monitoreo.",
  };
}
