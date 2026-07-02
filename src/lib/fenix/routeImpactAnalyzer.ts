import type { FenixAffectedZone, FenixRouteImpact } from "@/types/fenixSimulation";

export function findRoutesIntersectingZones(routeImpacts: FenixRouteImpact[], zones: FenixAffectedZone[]) {
  void zones;
  return routeImpacts.filter((route) => route.status !== "open");
}

export function estimateRouteRisk(route: FenixRouteImpact) {
  if (route.status === "blocked") return "critical";
  if (route.status === "compromised") return "high";
  if (route.status === "degraded") return "medium";
  return "low";
}

export function suggestRoutesForReview(routeImpacts: FenixRouteImpact[]) {
  return routeImpacts
    .filter((route) => route.status !== "open")
    .map((route) => ({
      routeId: route.routeId,
      routeName: route.routeName,
      recommendation: "Ruta sugerida para revisión; verificar con autoridad.",
      sourceType: route.metadata.sourceType,
    }));
}

export function buildRouteImpactSummary(routeImpacts: FenixRouteImpact[]) {
  const affected = routeImpacts.filter((route) => route.status !== "open").length;
  return `${affected} rutas potencialmente comprometidas. Datos demo/open-data según metadata.`;
}
