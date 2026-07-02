import type {
  FenixHazardType,
  FenixInstitutionalAccessLevel,
  FenixVehicleType,
} from "@/types/fenix";
import type { OfficialRouteMetadata } from "@/types/officialRoutes";

export type FenixGrowthDirection = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
export type FenixUncertaintyLevel = "low" | "medium" | "high";

export type FenixGrowthVector = {
  direction: FenixGrowthDirection;
  speedKmh: number;
  manualVector?: { x: number; y: number };
};

export type FenixSimulationInput = {
  scenarioId?: string;
  crisisType: FenixHazardType | "mass_casualty" | "conflict";
  initialLocation: {
    latitude: number;
    longitude: number;
    commune?: string;
    region?: string;
  };
  initialRadiusKm: number;
  growth: FenixGrowthVector;
  simulationMinutes: 15 | 30 | 60 | 180 | 360 | 720 | 1440;
  exposedPopulationEstimate?: number;
  mobility: FenixVehicleType | "mixed" | "light_vehicle" | "logistics_truck";
  mode: FenixInstitutionalAccessLevel;
  initialSeverity: "low" | "medium" | "high" | "critical";
  uncertainty: FenixUncertaintyLevel;
  sources: {
    citizenReports: boolean;
    connectedUsersAggregate: boolean;
    officialOrOpenRoutes: boolean;
    shelters: boolean;
    medicalPoints: boolean;
    existingIncidents: boolean;
    weather: boolean;
  };
};

export type FenixAffectedZone = {
  id: string;
  timeLabel: string;
  radiusKm: number;
  center: [number, number];
  exposureLevel: "low" | "medium" | "high" | "critical";
  isEstimated: boolean;
};

export type FenixRouteImpact = {
  routeId: string;
  routeName: string;
  status: "open" | "degraded" | "compromised" | "blocked";
  impact: string;
  alternative?: string;
  metadata: OfficialRouteMetadata;
};

export type FenixPopulationExposureEstimate = {
  estimatedPeople: number;
  vulnerableEstimate?: number;
  exposureLevel: "low" | "medium" | "high" | "critical";
  note: string;
};

export type FenixConnectedUsersEstimate = {
  approximateCount: number;
  areaLabel: string;
  exposureLevel: "low" | "medium" | "high" | "critical";
  privacyNote: string;
  isDemo: boolean;
};

export type FenixRecommendedAction = {
  id: string;
  audience: "public" | "institutional";
  priority: "low" | "medium" | "high" | "critical";
  text: string;
  safetyLimit: string;
};

export type FenixCrisisCourse = {
  initialCrisis: string;
  expectedGrowth: string;
  affectedZones: FenixAffectedZone[];
  routeImpacts: FenixRouteImpact[];
  populationExposure: FenixPopulationExposureEstimate;
  connectedUsersAggregate: FenixConnectedUsersEstimate;
  reportDensity: {
    relatedReports: number;
    densityLabel: "low" | "medium" | "high";
    isDemo: boolean;
  };
  shelters: Array<{ id: string; name: string; pressure: "low" | "medium" | "high" | "critical" }>;
  medicalPoints: Array<{ id: string; name: string; distanceKm: number; isDemo: boolean }>;
  recommendedActions: FenixRecommendedAction[];
  confidence: number;
  uncertainty: FenixUncertaintyLevel;
  limitations: string[];
};

export type FenixSimulationResult = {
  simulationId: string;
  input: FenixSimulationInput;
  generatedAt: string;
  course: FenixCrisisCourse;
  affectedZones: FenixAffectedZone[];
  routeImpacts: FenixRouteImpact[];
  connectedUsersAggregate: FenixConnectedUsersEstimate;
  reportDensity: FenixCrisisCourse["reportDensity"];
  shelters: FenixCrisisCourse["shelters"];
  medicalPoints: FenixCrisisCourse["medicalPoints"];
  confidence: number;
  uncertainty: FenixUncertaintyLevel;
  publicGuidance: string[];
  institutionalActionPlan: FenixRecommendedAction[];
  disclaimers: string[];
  isDemo: boolean;
};

