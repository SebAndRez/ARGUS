import { planArgusRoute } from "@/lib/routing/argusRoutingEngine";
import type { ArgusNavRoute, RouteHazard, RouteOptimizationMode, VehicleProfile } from "@/types/routing";
import type {
  HermesBlockage,
  HermesGeoPoint,
  HermesRiskZone,
  HermesRoute,
  HermesRoutingInput,
} from "@/modules/hermes/types";
import { scoreHermesRoute } from "@/modules/hermes/hermesRouteScoring";
import { evaluateHermesRouteSafety } from "@/modules/hermes/hermesRouteSafety";
import { generateHermesRouteExplanation } from "@/modules/hermes/hermesExplanations";

/**
 * HERMES no implementa un motor de routing propio: reutiliza el motor demo
 * ya existente en `src/lib/routing/argusRoutingEngine.ts`
 * (`planArgusRoute` + `getMockRoutes`), que genera geometría simulada entre
 * origen y destino con scoring de eficiencia relativo. HERMES agrega su
 * propia capa de explicabilidad (bloqueos VIGÍA/ORÁCULO, zonas TALOS,
 * confianza, advertencias) encima de esa geometría — no finge navegación
 * real exacta.
 */

const mobilityToVehicleProfile: Record<HermesRoutingInput["mobilityMode"], VehicleProfile> = {
  walking: "pedestrian",
  car: "car",
  motorcycle: "motorcycle",
  bicycle: "bicycle",
  ambulance: "ambulance",
  fire_truck: "fire_truck",
  police_vehicle: "pickup",
  logistics_truck: "truck",
  bus: "car",
  four_by_four: "four_by_four",
  // Sin perfil de vehículo real todavía: se aproxima a peatón para no
  // bloquear el flujo, dejando claro en la explicación que es un modo futuro.
  drone_future: "pedestrian",
  boat_future: "pedestrian",
};

const purposeToOptimizationMode: Record<HermesRoutingInput["purpose"], RouteOptimizationMode> = {
  safe_navigation: "safest",
  evacuation: "evacuation",
  medical_access: "emergency_response",
  shelter_access: "safest",
  logistics_delivery: "efficient_route",
  emergency_response: "emergency_response",
  area_avoidance: "low_exposure_route",
  reconnaissance: "fastest",
};

function toRouteHazards(blockages: HermesBlockage[], riskZones: HermesRiskZone[]): RouteHazard[] {
  const fromBlockages: RouteHazard[] = blockages.map((blockage) => ({
    id: blockage.id,
    title: `${blockage.type} (${blockage.status})`,
    latitude: blockage.location.lat,
    longitude: blockage.location.lng,
    severity: blockage.severity,
    confidence: blockage.confidence === "verified" ? 95 : blockage.confidence === "high" ? 80 : blockage.confidence === "medium" ? 55 : blockage.confidence === "low" ? 30 : 10,
    type: blockage.type,
    createdAt: blockage.createdAt,
  }));

  const fromZones: RouteHazard[] = riskZones.map((zone) => ({
    id: zone.id,
    title: `Zona de riesgo TALOS (${zone.category})`,
    latitude: zone.center.lat,
    longitude: zone.center.lng,
    severity: zone.riskLevel === "minimal" ? "low" : zone.riskLevel,
    confidence: zone.confidence === "verified" ? 95 : zone.confidence === "high" ? 80 : zone.confidence === "medium" ? 55 : zone.confidence === "low" ? 30 : 10,
    type: "talos_risk_zone",
    createdAt: new Date().toISOString(),
  }));

  return [...fromBlockages, ...fromZones];
}

function toGeometry(coordinates: Array<[number, number]>): HermesGeoPoint[] {
  return coordinates.map(([lat, lng]) => ({ lat, lng }));
}

function buildHermesRoute(
  id: string,
  name: string,
  navRoute: ArgusNavRoute,
  input: HermesRoutingInput,
  context: { nearbyBlockages: HermesBlockage[]; nearbyRiskZones: HermesRiskZone[]; recentDataAvailable: boolean }
): HermesRoute {
  const geometry = toGeometry(navRoute.coordinates);
  const scoreResult = scoreHermesRoute({ geometry, mobilityMode: input.mobilityMode, purpose: input.purpose }, context);

  const confirmedBlockageOnRoute = context.nearbyBlockages.some((b) => b.status === "confirmed");
  const safety = evaluateHermesRouteSafety(scoreResult, confirmedBlockageOnRoute, true);

  const route: HermesRoute = {
    id,
    name,
    purpose: input.purpose,
    mobilityMode: input.mobilityMode,
    status: safety.status,
    confidence: scoreResult.confidence,
    origin: input.origin,
    destination: input.destination,
    distanceMeters: Math.round(navRoute.distanceKm * 1000),
    estimatedDurationSeconds: Math.round(navRoute.estimatedMinutes * 60),
    safetyScore: scoreResult.safetyScore,
    riskScore: scoreResult.riskScore,
    reliabilityScore: scoreResult.reliabilityScore,
    routeScore: scoreResult.routeScore,
    geometry,
    warnings: safety.warnings,
    constraints: input.constraints ?? [],
    linkedReports: context.nearbyBlockages.filter((b) => b.sourceModule === "VIGIA").map((b) => b.sourceId ?? b.id),
    linkedTalosAssessments: context.nearbyRiskZones.map((z) => z.id),
    linkedEvidence: context.nearbyBlockages.filter((b) => b.sourceModule === "ORACULO").map((b) => b.sourceId ?? b.id),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    explanation: "",
  };
  route.explanation = generateHermesRouteExplanation(route, scoreResult);
  return route;
}

export async function calculateHermesRoutes(input: HermesRoutingInput): Promise<HermesRoute[]> {
  const blockages = input.blockages ?? [];
  const riskZones = input.riskZones ?? [];
  const hazards = toRouteHazards(blockages, riskZones);
  const vehicleProfile = mobilityToVehicleProfile[input.mobilityMode];
  const optimizationMode = purposeToOptimizationMode[input.purpose];

  const plan = await planArgusRoute({
    origin: [input.origin.lat, input.origin.lng],
    destination: [input.destination.lat, input.destination.lng],
    vehicleProfile,
    hazards,
    optimizationMode,
  });

  const context = {
    nearbyBlockages: blockages,
    nearbyRiskZones: riskZones,
    recentDataAvailable: blockages.length > 0 || riskZones.length > 0,
  };

  const recommended = buildHermesRoute(
    `hermes-route-${plan.recommendedRoute.id}`,
    plan.recommendedRoute.name,
    plan.recommendedRoute,
    input,
    context
  );
  const alternatives = plan.alternativeRoutes.map((altRoute) =>
    buildHermesRoute(`hermes-route-${altRoute.id}`, altRoute.name, altRoute, input, context)
  );

  return [recommended, ...alternatives].map((route) => ({ ...route, isDemo: true }));
}
