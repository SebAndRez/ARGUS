import type { CrisisEvent } from "@/types/crisis";

export type VehicleProfile =
  | "pedestrian"
  | "bicycle"
  | "motorcycle"
  | "car"
  | "pickup"
  | "four_by_four"
  | "truck"
  | "ambulance"
  | "fire_truck"
  | "rescue_team"
  | "aid_logistics";

export type RouteRiskLevel = "low" | "medium" | "high" | "critical";
export type RoutingMode = "normal" | "evacuation" | "logistics" | "convoy";
export type RouteOptimizationMode =
  | "fastest"
  | "shortest"
  | "safest"
  | "efficient_route"
  | "low_fuel_route"
  | "low_exposure_route"
  | "emergency_response"
  | "evacuation";

export type RouteHazard = {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
  severity: RouteRiskLevel;
  confidence: number;
  type: string;
  createdAt: string;
};

export type RouteSegmentWarning = {
  id: string;
  segmentIndex: number;
  level: RouteRiskLevel;
  message: string;
  relatedHazardId?: string;
  distanceMeters?: number;
};

export type TurnPenalty = {
  turnCount: number;
  conflictTurnCount: number;
  scoreImpact: number;
};

export type FuelEfficiencyScore = {
  score: number;
  estimatedRelativeConsumption: "low" | "medium" | "high";
  explanation: string;
};

export type ManeuverRisk = {
  level: RouteRiskLevel;
  complexManeuvers: number;
  explanation: string;
};

export type StopPenalty = {
  estimatedStops: number;
  trafficLights: number;
  scoreImpact: number;
};

export type TrafficConflictPenalty = {
  congestionLevel: RouteRiskLevel;
  scoreImpact: number;
  explanation: string;
};

export type RouteReliability = {
  score: number;
  level: RouteRiskLevel;
  reasons: string[];
  unstableSegments: RouteSegmentWarning[];
};

export type ArgusNavRoute = {
  id: string;
  name: string;
  coordinates: Array<[number, number]>;
  distanceKm: number;
  estimatedMinutes: number;
  riskLevel: RouteRiskLevel;
  warnings: RouteSegmentWarning[];
  vehicleProfile: VehicleProfile;
  optimizationMode: RouteOptimizationMode;
  turnPenalty: TurnPenalty;
  stopPenalty: StopPenalty;
  reliability: RouteReliability;
};

export type RouteEfficiencyScore = {
  fuelScore: number;
  safetyScore: number;
  exposureScore: number;
  maneuverScore: number;
  totalScore: number;
  explanation: string;
};

export type ArgusRoutePlan = {
  mode: RoutingMode;
  vehicleProfile: VehicleProfile;
  optimizationMode: RouteOptimizationMode;
  recommendedRoute: ArgusNavRoute;
  alternativeRoutes: ArgusNavRoute[];
  riskLevel: RouteRiskLevel;
  explanation: string;
  efficiency: RouteEfficiencyScore;
};

export type EvacuationThreatType =
  | "earthquake"
  | "tsunami"
  | "wildfire"
  | "urban_fire"
  | "flood"
  | "landslide"
  | "chemical_accident"
  | "radiological_accident"
  | "civil_unrest"
  | "blackout"
  | "conflict_zone"
  | "medical_emergency"
  | "infrastructure_collapse";

export type EvacuationObjective =
  | "safe_zone"
  | "high_ground"
  | "shelter"
  | "hospital"
  | "family_meeting_point"
  | "outside_danger_radius"
  | "supply_center"
  | "manual_destination";

export type SafePointType =
  | "shelter"
  | "hospital"
  | "police_station"
  | "fire_station"
  | "medical_post"
  | "supply_center"
  | "fuel_station"
  | "pharmacy"
  | "water_point"
  | "charging_point"
  | "high_ground"
  | "helipad"
  | "evacuation_area"
  | "family_meeting_point"
  | "communication_point"
  | "command_post";

export type SafePointStatus =
  | "operational"
  | "limited"
  | "overloaded"
  | "closed"
  | "unknown";

export type SafePoint = {
  id: string;
  name: string;
  type: SafePointType;
  status: SafePointStatus;
  coordinates: [number, number];
  capacityLevel?: "low" | "medium" | "high" | "critical";
  powerAvailable?: boolean;
  waterAvailable?: boolean;
  medicalSupport?: boolean;
  communicationsAvailable?: boolean;
  lastUpdatedAt: string;
  source: "official" | "admin" | "user_verified" | "osint" | "demo";
  notes?: string;
};

export type ActiveRouteAlert = {
  id: string;
  routeId: string;
  type:
    | "new_hazard"
    | "road_block"
    | "fire_spread"
    | "flood_risk"
    | "congestion"
    | "route_degraded"
    | "better_route_available"
    | "safe_point_unavailable"
    | "destination_risk_changed";
  severity: 1 | 2 | 3 | 4 | 5;
  message: string;
  recommendedAction?: string;
  createdAt: string;
};

export type VehicleAccessibilityStatus =
  | "recommended"
  | "possible"
  | "not_recommended"
  | "blocked"
  | "unknown";

export type VehicleAccessibility = {
  vehicleProfile: VehicleProfile;
  status: VehicleAccessibilityStatus;
  reason: string;
};

export type LogisticsCargoType =
  | "water"
  | "food"
  | "medicine"
  | "fuel"
  | "medical_equipment"
  | "rescue_equipment"
  | "shelter_supplies"
  | "communications_equipment"
  | "other";

export type LogisticsVehicle = {
  id: string;
  name: string;
  vehicleProfile: VehicleProfile;
  capacityKg?: number;
  capacityLiters?: number;
  available: boolean;
  currentLocation: [number, number];
};

export type DeliveryPoint = {
  id: string;
  name: string;
  coordinates: [number, number];
  priority: 1 | 2 | 3 | 4 | 5;
  requiredCargo: LogisticsCargoType[];
  accessRequirement?: VehicleProfile[];
  notes?: string;
};

export type LogisticsAssignment = {
  vehicleId: string;
  deliveryPointIds: string[];
  explanation: string;
};

export type LogisticsRoutePlan = {
  id: string;
  vehicles: LogisticsVehicle[];
  deliveryPoints: DeliveryPoint[];
  assignments: LogisticsAssignment[];
  totalDistanceKm: number;
  estimatedDurationMinutes: number;
  riskLevel: RouteRiskLevel;
  explanation: string;
};

export type ConvoyVehicleStatus =
  | "on_route"
  | "delayed"
  | "stopped"
  | "off_route"
  | "lost_signal"
  | "arrived";

export type ConvoyVehicle = {
  id: string;
  name: string;
  vehicleProfile: VehicleProfile;
  status: ConvoyVehicleStatus;
  lastKnownLocation?: [number, number];
  lastUpdatedAt?: string;
};

export type RallyPoint = {
  id: string;
  name: string;
  coordinates: [number, number];
  purpose: "regroup" | "fuel" | "medical" | "rest" | "security_check" | "route_decision";
};

export type ConvoyPlan = {
  id: string;
  name: string;
  leaderVehicleId: string;
  vehicles: ConvoyVehicle[];
  routeId: string;
  rallyPoints: RallyPoint[];
  safeStops: SafePoint[];
  status: "planned" | "active" | "completed" | "cancelled";
};

export type OfflineCrisisPack = {
  id: string;
  name: string;
  regionName: string;
  bounds: { north: number; south: number; east: number; west: number };
  includesMaps: boolean;
  includesSafePoints: boolean;
  includesEvacuationRoutes: boolean;
  includesHospitals: boolean;
  includesShelters: boolean;
  includesEmergencyContacts: boolean;
  lastDownloadedAt?: string;
  sizeMb?: number;
  status: "not_downloaded" | "available" | "outdated" | "downloading";
};

export type RoadBlockPrediction = {
  id: string;
  routeId?: string;
  location: [number, number];
  probability: number;
  timeWindowMinutes: number;
  cause:
    | "fire_spread"
    | "flood_rise"
    | "landslide_risk"
    | "congestion_growth"
    | "aftershock_damage"
    | "civil_unrest_growth"
    | "infrastructure_failure";
  recommendation: string;
  confidence: number;
};

export type NeedToReachOption =
  | "hospital"
  | "shelter"
  | "high_ground"
  | "fire_station"
  | "water"
  | "pharmacy"
  | "family"
  | "meeting_point"
  | "supply_center"
  | "exit_danger_zone";

export type RoutingIncidentInput = Pick<
  CrisisEvent,
  "id" | "title" | "type" | "severity" | "latitude" | "longitude" | "createdAt" | "confidence"
> & {
  category?: string;
};
