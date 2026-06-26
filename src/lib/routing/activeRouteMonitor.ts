import type {
  ActiveRouteAlert,
  ArgusNavRoute,
  RoutingIncidentInput,
} from "@/types/routing";

export function monitorActiveRoute(
  route: ArgusNavRoute,
  incidents: RoutingIncidentInput[]
): ActiveRouteAlert[] {
  const alerts: ActiveRouteAlert[] = [];
  const criticalIncident = incidents.find(
    (incident) => incident.severity === "CRITICAL" || incident.severity === "HIGH"
  );

  if (criticalIncident) {
    alerts.push({
      id: `route-alert-${route.id}-${criticalIncident.id}`,
      routeId: route.id,
      type: "new_hazard",
      severity: criticalIncident.severity === "CRITICAL" ? 5 : 4,
      message: `Nueva alerta cerca de ruta: ${criticalIncident.title}.`,
      recommendedAction: "Revisar ruta alternativa antes de continuar.",
      createdAt: new Date().toISOString(),
    });
  }

  if (route.riskLevel === "high" || route.riskLevel === "critical") {
    alerts.push({
      id: `route-degraded-${route.id}`,
      routeId: route.id,
      type: "route_degraded",
      severity: route.riskLevel === "critical" ? 5 : 4,
      message: "La ruta activa muestra degradacion operacional.",
      recommendedAction: "Solicitar recalculo de ruta si existe alternativa segura.",
      createdAt: new Date().toISOString(),
    });
  }

  return alerts;
}
