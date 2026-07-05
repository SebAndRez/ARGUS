/**
 * ARGUS HERMES: rutas inteligentes, evacuación y movilidad operacional
 * multimodal. HERMES transforma contexto operacional (bloqueos, riesgo
 * TALOS, evidencia ORÁCULO, reportes VIGÍA) en movilidad útil y explicable.
 * No calcula riesgo final (TALOS), no valida evidencia profunda (ORÁCULO),
 * no gestiona refugios (ARCA) ni inventario (NEXUS), y nunca promete
 * seguridad absoluta ni reemplaza instrucciones oficiales.
 */

export type HermesMobilityMode =
  | "walking"
  | "car"
  | "motorcycle"
  | "bicycle"
  | "ambulance"
  | "fire_truck"
  | "police_vehicle"
  | "logistics_truck"
  | "bus"
  | "four_by_four"
  | "drone_future"
  | "boat_future";

export type HermesRoutePurpose =
  | "safe_navigation"
  | "evacuation"
  | "medical_access"
  | "shelter_access"
  | "logistics_delivery"
  | "emergency_response"
  | "area_avoidance"
  | "reconnaissance";

export type HermesRouteStatus = "available" | "caution" | "high_risk" | "blocked" | "unknown" | "restricted";

export type HermesRouteConfidence = "unknown" | "low" | "medium" | "high" | "verified";

export interface HermesGeoPoint {
  lat: number;
  lng: number;
  label?: string;
  accuracyMeters?: number;
  isApproximate?: boolean;
}

export type HermesWarningType =
  | "road_block"
  | "fire_nearby"
  | "flood_nearby"
  | "landslide_risk"
  | "traffic_accident"
  | "low_confidence"
  | "conflicting_reports"
  | "medical_priority"
  | "restricted_area"
  | "critical_infrastructure"
  | "unknown_condition";

export interface HermesRouteWarning {
  id: string;
  type: HermesWarningType;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  sourceModule?: "VIGIA" | "TALOS" | "ORACULO" | "ATLAS" | "ARCA" | "AURA" | "NEXUS";
}

export type HermesRouteConstraintType =
  | "avoid_zone"
  | "avoid_road"
  | "prefer_main_roads"
  | "prefer_low_risk"
  | "prefer_shelters"
  | "prefer_medical_points"
  | "vehicle_limit"
  | "emergency_priority"
  | "logistics_priority";

export interface HermesRouteConstraint {
  id: string;
  type: HermesRouteConstraintType;
  description: string;
  active: boolean;
}

export interface HermesRoute {
  id: string;
  name: string;
  purpose: HermesRoutePurpose;
  mobilityMode: HermesMobilityMode;
  status: HermesRouteStatus;
  confidence: HermesRouteConfidence;
  origin: HermesGeoPoint;
  destination: HermesGeoPoint;
  distanceMeters?: number;
  estimatedDurationSeconds?: number;
  safetyScore: number;
  riskScore: number;
  reliabilityScore: number;
  routeScore: number;
  geometry: HermesGeoPoint[];
  warnings: HermesRouteWarning[];
  constraints: HermesRouteConstraint[];
  linkedReports: string[];
  linkedTalosAssessments: string[];
  linkedEvidence: string[];
  linkedShelters?: string[];
  linkedMedicalPoints?: string[];
  createdAt: string;
  updatedAt: string;
  explanation: string;
  isDemo?: boolean;
}

export type HermesBlockageType =
  | "road_block"
  | "flood"
  | "fire"
  | "landslide"
  | "traffic_accident"
  | "police_closure"
  | "infrastructure_damage"
  | "unknown";

export type HermesBlockageStatus = "reported" | "confirmed" | "cleared" | "disputed";

export interface HermesBlockage {
  id: string;
  type: HermesBlockageType;
  status: HermesBlockageStatus;
  severity: "low" | "medium" | "high" | "critical";
  location: HermesGeoPoint;
  affectedRadiusMeters?: number;
  sourceModule: "VIGIA" | "ORACULO" | "ATLAS" | "TALOS" | "MANUAL";
  sourceId?: string;
  confidence: HermesRouteConfidence;
  createdAt: string;
  updatedAt: string;
}

export interface HermesRoutingInput {
  origin: HermesGeoPoint;
  destination: HermesGeoPoint;
  mobilityMode: HermesMobilityMode;
  purpose: HermesRoutePurpose;
  blockages?: HermesBlockage[];
  riskZones?: HermesRiskZone[];
  constraints?: HermesRouteConstraint[];
}

export interface HermesRiskZone {
  id: string;
  center: HermesGeoPoint;
  radiusMeters: number;
  riskLevel: "minimal" | "low" | "medium" | "high" | "critical";
  category: string;
  confidence: HermesRouteConfidence;
  recommendedModules: string[];
}

export interface HermesRouteScoreResult {
  routeScore: number;
  safetyScore: number;
  riskScore: number;
  reliabilityScore: number;
  confidence: HermesRouteConfidence;
  reasons: string[];
  penalties: string[];
  warnings: HermesRouteWarning[];
}

export interface HermesRouteSafetyResult {
  status: HermesRouteStatus;
  warnings: HermesRouteWarning[];
  shouldBlockVisually: boolean;
  requiresInstitutionalConfirmation: boolean;
  shouldRecommendAlternative: boolean;
}

export type HermesFeature =
  | "view_public_routes"
  | "plan_basic_route"
  | "view_blockages"
  | "view_risk_layers"
  | "plan_evacuation_route"
  | "plan_medical_route"
  | "plan_logistics_route"
  | "view_operational_layers"
  | "manage_blockage_status"
  | "export_routes"
  | "send_to_atlas"
  | "send_to_fenix";

export interface HermesAtlasSummary {
  availableRoutes: number;
  blockedRoutes: number;
  criticalBlockages: number;
  activeEvacuationRoutes: number;
  availableMedicalRoutes: number;
  affectedLogisticsRoutes: number;
  zonesWithoutAlternative: number;
  lastUpdatedIso: string | null;
}

export interface HermesArcaSignal {
  routeId: string;
  shelterId: string;
  distanceMeters?: number;
  hasCapacitySignal: boolean;
  routeStatus: HermesRouteStatus;
  isLeastRiskOption: boolean;
}

export interface HermesAuraSignal {
  routeId: string;
  medicalPointId: string;
  distanceMeters?: number;
  routeStatus: HermesRouteStatus;
  recommendsAmbulance: boolean;
}

export interface HermesNexusSignal {
  routeId: string;
  logisticsPriority: "low" | "medium" | "high" | "critical";
  routesAffected: boolean;
  probableResources: string[];
  approximateZone?: HermesGeoPoint;
}

export interface HermesFenixSignal {
  candidateRouteIds: string[];
  blockedRouteIds: string[];
  evacuationRouteIds: string[];
  estimatedDurationsSeconds: Record<string, number | undefined>;
  warnings: HermesRouteWarning[];
  confidence: HermesRouteConfidence;
  missingData: string[];
}
