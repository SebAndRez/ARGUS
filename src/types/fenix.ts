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
  | "compromised"
  /** Refugio real sin reporte de estado todavia (nunca usado por escenarios demo). */
  | "unknown";

export type FenixShelterRouteStatus = "open" | "congested" | "blocked" | "unknown";
export type FenixShelterSourceType = "senapred" | "codigo_azul" | "municipality" | "media" | "manual_operator" | "osm" | "argus_estimate" | "demo";

/**
 * Como FENIX puede usar un refugio real como candidato (spec ARGUS v1.0.3.5
 * §23): `confirmed` = evidencia oficial de que esta abierto y disponible;
 * `potential` = aparece en el registro oficial pero su disponibilidad no
 * esta confirmada; `reference` = el recinto existe (p.ej. solo Codigo Azul,
 * sin estado operacional verificado) pero no debe usarse como recomendacion
 * operacional. Ver `deriveFenixRecommendationTier` en `fenixShelterSource.ts`.
 */
export type FenixShelterRecommendationTier = "confirmed" | "potential" | "reference";

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
  /** Solo presente para refugios demo; los reales se filtran por proximidad, no por escenario. */
  scenarioId?: string;
  name: string;
  status: FenixShelterStatus;
  coordinates: [number, number];
  /** Ausente = capacidad no informada todavia. Nunca inventar un numero. */
  capacity?: number;
  /** Ausente = ocupacion no informada todavia. Nunca inventar un numero. */
  currentOccupancy?: number;
  /** Cifra autoreportada por la fuente (p.ej. "Cupos" de Codigo Azul), sin significado de disponibilidad confirmado. Nunca presentar como "cupos disponibles". */
  capacityDeclared?: number;
  /** Horario de operacion publicado tal cual (p.ej. "24 Horas"). Nunca implica disponibilidad actual. */
  operatingHours?: string;
  /** Ausente = servicio no informado (nunca equivale a `false`). */
  medicalSupport?: boolean;
  powerAvailable?: boolean;
  waterAvailable?: boolean;
  /** Servicios adicionales — solo poblados para refugios reales, ausentes (nunca `false`) en refugios demo. */
  hasFood?: boolean;
  hasHeating?: boolean;
  hasBathrooms?: boolean;
  hasShowers?: boolean;
  isAccessible?: boolean;
  allowsPets?: boolean;
  hasConnectivity?: boolean;
  accessNotes?: string;

  /** Campos de procedencia — solo poblados para refugios reales (`source: "critical_poi"` en `/api/fenix/shelters`); ausentes en refugios demo. */
  poiId?: string;
  address?: string;
  operatorName?: string;
  contactPhone?: string;
  routeStatus?: FenixShelterRouteStatus;
  sourceType?: FenixShelterSourceType;
  sourceName?: string;
  confidence?: number;
  verificationStatus?: string;
  lastVerifiedAt?: string;
  isStale?: boolean;
  publicationStatus?: "active" | "missing" | "stale" | "archived";
  /** Precision de la ubicacion — ver `locationAccuracy` en `CriticalPoi.tagsJson`. Ausente en refugios demo (siempre precisos). */
  locationAccuracy?: "precise" | "approximate" | "commune_centroid" | "unresolved";
  fenixRecommendationTier?: FenixShelterRecommendationTier;
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
