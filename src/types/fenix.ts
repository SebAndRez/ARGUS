export type FenixHazardType =
  | "wildfire"
  | "tsunami"
  | "earthquake"
  | "flood"
  | "volcanic"
  | "chemical"
  | "urban_crisis"
  | "infrastructure_failure";

export type FenixRouteStatus =
  | "open"
  | "congested"
  | "critical"
  | "blocked"
  | "emergency_only";

export type FenixShelterStatus =
  | "available"
  | "near_capacity"
  | "full"
  | "closed"
  | "compromised";

export type FenixVehicleType =
  | "pedestrian"
  | "car"
  | "bus"
  | "ambulance"
  | "firetruck"
  | "police"
  | "military"
  | "motorcycle"
  | "four_by_four";

export type FenixInstitutionalAccessLevel = "public" | "institutional";

export type FenixScenario = {
  id: string;
  name: string;
  hazardType: FenixHazardType;
  regionName: string;
  description: string;
  center: [number, number];
  radiusKm: number;
  publicInstruction: string;
};

export type FenixEvacuationRoute = {
  id: string;
  scenarioId: string;
  name: string;
  coordinates: Array<[number, number]>;
  distanceKm: number;
  estimatedMinutes: number;
  status: FenixRouteStatus;
  capacityPerHour: number;
  currentFlowPerHour: number;
  allowedVehicles: FenixVehicleType[];
  exposureScore: number;
  confidenceScore: number;
  notes?: string;
};

export type FenixRouteCollapsePrediction = {
  routeId: string;
  routeName: string;
  status: FenixRouteStatus;
  collapseRisk: number;
  estimatedMinutesToSaturation?: number;
  reason: string;
};

export type FenixShelter = {
  id: string;
  scenarioId: string;
  name: string;
  status: FenixShelterStatus;
  coordinates: [number, number];
  capacity: number;
  currentOccupancy: number;
  medicalSupport: boolean;
  powerAvailable: boolean;
  waterAvailable: boolean;
  accessNotes?: string;
};

export type FenixPopulationExposure = {
  id: string;
  scenarioId: string;
  zoneName: string;
  estimatedPopulation: number;
  vulnerablePopulationEstimate?: number;
  exposureLevel: "low" | "medium" | "high" | "critical";
};

export type FenixActionItem = {
  id: string;
  priority: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  reason: string;
  relatedEntityId?: string;
  expectedImpact: string;
  suggestedStatus: "planned" | "activate_now" | "monitor" | "requires_review";
};

export type FenixActionPlan = {
  id: string;
  scenarioId: string;
  generatedAt: string;
  items: FenixActionItem[];
};

export type FenixSimulationResult = {
  scenarioId: string;
  generatedAt: string;
  accessLevel: FenixInstitutionalAccessLevel;
  hazardType: FenixHazardType;
  totalExposedPopulation: number;
  estimatedEvacuationTimeMinutes: number;
  recommendedPublicRoute?: FenixEvacuationRoute;
  recommendedShelter?: FenixShelter;
  criticalRoutes: FenixEvacuationRoute[];
  blockedRoutes: FenixEvacuationRoute[];
  collapsePredictions: FenixRouteCollapsePrediction[];
  shelterAnalysis: FenixShelter[];
  actionPlan: FenixActionPlan;
  confidenceScore: number;
  summary: string;
  publicInstruction: string;
};
