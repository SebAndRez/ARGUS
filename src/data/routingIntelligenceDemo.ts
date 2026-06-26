import type {
  ArgusNavRoute,
  DeliveryPoint,
  LogisticsVehicle,
  RoadBlockPrediction,
  VehicleProfile,
} from "@/types/routing";

export type RoutingIntelligenceRoute = {
  id: string;
  name: string;
  coordinates: Array<[number, number]>;
  status: "open" | "congested" | "critical" | "blocked" | "emergency_only";
  averageSpeedKmh: number;
  estimatedCapacityPerHour: number;
  currentFlowPerHour: number;
  blockages: string[];
  citizenReports: number;
  allowedVehicles: VehicleProfile[];
  confidenceScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
};

export const demoRoutingRoutes: RoutingIntelligenceRoute[] = [
  {
    id: "ri-ruta-oriente",
    name: "Corredor Oriente Seguro",
    coordinates: [
      [-33.4489, -70.6693],
      [-33.4388, -70.625],
      [-33.424, -70.59],
    ],
    status: "open",
    averageSpeedKmh: 34,
    estimatedCapacityPerHour: 1400,
    currentFlowPerHour: 720,
    blockages: [],
    citizenReports: 2,
    allowedVehicles: ["pedestrian", "bicycle", "motorcycle", "car", "pickup", "ambulance"],
    confidenceScore: 78,
    riskLevel: "low",
  },
  {
    id: "ri-eje-central",
    name: "Eje Central Congestionado",
    coordinates: [
      [-33.46, -70.68],
      [-33.452, -70.66],
      [-33.442, -70.64],
    ],
    status: "critical",
    averageSpeedKmh: 12,
    estimatedCapacityPerHour: 900,
    currentFlowPerHour: 1100,
    blockages: ["congestion_estimated"],
    citizenReports: 8,
    allowedVehicles: ["motorcycle", "car", "pickup", "ambulance", "fire_truck"],
    confidenceScore: 66,
    riskLevel: "high",
  },
  {
    id: "ri-emergency-only",
    name: "Ruta reservada emergencia",
    coordinates: [
      [-33.49, -70.66],
      [-33.475, -70.63],
      [-33.456, -70.61],
    ],
    status: "emergency_only",
    averageSpeedKmh: 28,
    estimatedCapacityPerHour: 600,
    currentFlowPerHour: 180,
    blockages: [],
    citizenReports: 1,
    allowedVehicles: ["ambulance", "fire_truck", "rescue_team", "aid_logistics"],
    confidenceScore: 74,
    riskLevel: "medium",
  },
];

export const demoNavRoutes: ArgusNavRoute[] = demoRoutingRoutes.map((route, index) => ({
  id: route.id,
  name: route.name,
  coordinates: route.coordinates,
  distanceKm: index === 0 ? 8.4 : index === 1 ? 6.7 : 9.2,
  estimatedMinutes: Math.max(8, Math.round((index === 1 ? 6.7 : 8.4) / Math.max(5, route.averageSpeedKmh) * 60)),
  riskLevel: route.riskLevel,
  warnings: route.blockages.map((blockage, blockageIndex) => ({
    id: `${route.id}-warning-${blockageIndex}`,
    segmentIndex: blockageIndex,
    level: route.riskLevel,
    message: `Riesgo de ruta: ${blockage}`,
  })),
  vehicleProfile: "car",
  optimizationMode: "safest",
  turnPenalty: { turnCount: 8 + index, conflictTurnCount: index + 1, scoreImpact: index * 4 },
  stopPenalty: { estimatedStops: 5 + index, trafficLights: 4 + index, scoreImpact: index * 3 },
  reliability: {
    score: route.confidenceScore,
    level: route.riskLevel,
    reasons: [`${route.citizenReports} reportes cercanos`, `Estado ${route.status}`],
    unstableSegments: [],
  },
}));

export const demoLogisticsVehicles: LogisticsVehicle[] = [
  {
    id: "veh-aid-1",
    name: "Camioneta ayuda 1",
    vehicleProfile: "pickup",
    capacityKg: 650,
    available: true,
    currentLocation: [-33.4489, -70.6693],
  },
  {
    id: "veh-4x4-1",
    name: "4x4 rescate",
    vehicleProfile: "four_by_four",
    capacityKg: 420,
    available: true,
    currentLocation: [-33.46, -70.64],
  },
];

export const demoDeliveryPoints: DeliveryPoint[] = [
  {
    id: "delivery-water-1",
    name: "Entrega agua refugio oriente",
    coordinates: [-33.4645, -70.6107],
    priority: 5,
    requiredCargo: ["water", "food"],
    accessRequirement: ["pickup", "four_by_four", "aid_logistics"],
  },
  {
    id: "delivery-medicine-1",
    name: "Entrega medicamentos punto medico",
    coordinates: [-33.5224, -70.5981],
    priority: 4,
    requiredCargo: ["medicine"],
    accessRequirement: ["car", "pickup", "four_by_four"],
  },
];

export const demoRoadBlockPredictions: RoadBlockPrediction[] = [
  {
    id: "roadblock-central-1",
    routeId: "ri-eje-central",
    location: [-33.452, -70.66],
    probability: 0.72,
    timeWindowMinutes: 45,
    cause: "congestion_growth",
    recommendation: "Usar ruta alternativa oriente si la salida no es urgente.",
    confidence: 0.62,
  },
];
