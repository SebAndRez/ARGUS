import { demoSafePoints } from "@/data/demoSafePoints";
import { planArgusRoute } from "@/lib/routing/argusRoutingEngine";
import type {
  EvacuationObjective,
  EvacuationThreatType,
  RoutingIncidentInput,
  SafePoint,
  VehicleProfile,
} from "@/types/routing";

function pickSafePoint(objective: EvacuationObjective): SafePoint {
  if (objective === "high_ground") {
    return demoSafePoints.find((point) => point.type === "high_ground") ?? demoSafePoints[0];
  }
  if (objective === "hospital") {
    return demoSafePoints.find((point) => point.medicalSupport) ?? demoSafePoints[0];
  }
  return demoSafePoints.find((point) => point.status === "operational") ?? demoSafePoints[0];
}

export async function calculateEvacuationRoute(input: {
  currentLocation: [number, number];
  threatType: EvacuationThreatType;
  objective: EvacuationObjective;
  vehicleProfile: VehicleProfile;
  incidents?: RoutingIncidentInput[];
}) {
  const destination = pickSafePoint(input.objective);
  const plan = await planArgusRoute({
    origin: input.currentLocation,
    destination: destination.coordinates,
    vehicleProfile: input.vehicleProfile,
    optimizationMode:
      input.threatType === "tsunami" ? "evacuation" : "low_exposure_route",
    hazards: (input.incidents ?? []).map((incident) => ({
      id: incident.id,
      title: incident.title,
      latitude: incident.latitude,
      longitude: incident.longitude,
      severity: incident.severity.toLowerCase() as "low" | "medium" | "high" | "critical",
      confidence: incident.confidence ?? 55,
      type: incident.type,
      createdAt: incident.createdAt,
    })),
  });

  return {
    destination,
    plan,
    urgency:
      input.threatType === "tsunami" || input.threatType === "wildfire"
        ? "high"
        : "medium",
    reliability: plan.recommendedRoute.reliability,
    explanation:
      input.threatType === "tsunami"
        ? "ARGUS prioriza salida hacia zona alta y menor exposicion costera."
        : "ARGUS prioriza menor exposicion a incidentes activos y puntos seguros alternativos.",
  };
}
