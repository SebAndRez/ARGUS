import type {
  DeliveryPoint,
  LogisticsRoutePlan,
  LogisticsVehicle,
  RoutingIncidentInput,
} from "@/types/routing";

export function createLogisticsRoutePlan(input: {
  vehicles: LogisticsVehicle[];
  deliveryPoints: DeliveryPoint[];
  incidents?: RoutingIncidentInput[];
}): LogisticsRoutePlan {
  const availableVehicles = input.vehicles.filter((vehicle) => vehicle.available);
  const sortedPoints = [...input.deliveryPoints].sort(
    (left, right) => right.priority - left.priority
  );
  const assignments = availableVehicles.map((vehicle) => {
    const compatiblePoints = sortedPoints.filter(
      (point) =>
        !point.accessRequirement ||
        point.accessRequirement.includes(vehicle.vehicleProfile)
    );
    return {
      vehicleId: vehicle.id,
      deliveryPointIds: compatiblePoints.slice(0, 2).map((point) => point.id),
      explanation:
        vehicle.vehicleProfile === "four_by_four"
          ? "Preferido para zonas degradadas o acceso rural."
          : "Asignacion demo por prioridad y compatibilidad.",
    };
  });

  const criticalNearby = (input.incidents ?? []).some(
    (incident) => incident.severity === "CRITICAL"
  );

  return {
    id: "logistics-plan-demo",
    vehicles: availableVehicles,
    deliveryPoints: sortedPoints,
    assignments,
    totalDistanceKm: sortedPoints.length * 5.4,
    estimatedDurationMinutes: sortedPoints.length * 18,
    riskLevel: criticalNearby ? "high" : "medium",
    explanation:
      "Plan heuristico demo: prioridad alta primero, vehiculo compatible y evita riesgo critico cuando hay alternativa.",
  };
}
