import type { ArgusNavRoute, RoadBlockPrediction, RoutingIncidentInput } from "@/types/routing";

export function predictRoadBlocks(
  route: ArgusNavRoute,
  incidents: RoutingIncidentInput[]
): RoadBlockPrediction[] {
  return incidents
    .filter((incident) => ["HIGH", "CRITICAL"].includes(incident.severity))
    .slice(0, 3)
    .map((incident, index) => ({
      id: `roadblock-${route.id}-${incident.id}`,
      routeId: route.id,
      location: [incident.latitude, incident.longitude],
      probability: incident.severity === "CRITICAL" ? 0.78 : 0.56,
      timeWindowMinutes: incident.severity === "CRITICAL" ? 35 + index * 10 : 60,
      cause:
        incident.category?.toLowerCase().includes("fire")
          ? "fire_spread"
          : incident.category?.toLowerCase().includes("flood")
            ? "flood_rise"
            : "congestion_growth",
      recommendation:
        "Usar ruta alternativa si el destino no es urgente y confirmar con fuentes oficiales.",
      confidence: (incident.confidence ?? 55) / 100,
    }));
}
