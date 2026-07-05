import type { ArgusRole } from "@/types/rbac";

export type FenixScenarioType = "wildfire" | "earthquake" | "tsunami" | "flood" | "landslide" | "volcano" | "storm" | "infrastructure_failure" | "mass_casualty" | "public_security" | "humanitarian" | "other";
export type FenixScenarioStatus = "draft" | "ready" | "running" | "completed" | "requires_review" | "failed";
export type FenixConfidence = "unknown" | "low" | "medium" | "high" | "verified";
export type FenixImpactLevel = "minimal" | "low" | "medium" | "high" | "critical";

export type FenixScenarioAssumption = {
  id: string;
  label: string;
  value: string | number | boolean;
  confidence: FenixConfidence;
  sourceModule?: "TALOS" | "HERMES" | "ARCA" | "NEXUS" | "AURA" | "ORACULO" | "VIGIA" | "ATLAS" | "MANUAL";
  notes?: string;
};

export type FenixScenarioInputs = {
  talosRiskLevel?: string;
  hermesRoutes?: unknown[];
  arcaShelters?: unknown[];
  nexusResources?: unknown[];
  auraMedicalCapacity?: unknown[];
  oraculoEvidence?: unknown[];
  vigiaReports?: unknown[];
  estimatedPopulation?: number;
  evacuationWindowMinutes?: number;
  weatherContext?: string;
  mobilityConstraints?: string[];
};

export type FenixRouteImpact = { routeId?: string; routeName: string; status: "available" | "strained" | "likely_congested" | "blocked" | "unknown"; estimatedSaturationMinutes?: number; impactLevel: FenixImpactLevel; reason: string };
export type FenixShelterImpact = { shelterId?: string; shelterName: string; estimatedDemand?: number; capacityStatus?: string; impactLevel: FenixImpactLevel; reason: string };
export type FenixResourceImpact = { category: string; estimatedDemand?: number; availableEstimate?: number; gapEstimate?: number; impactLevel: FenixImpactLevel; reason: string };
export type FenixMedicalImpact = { medicalPointId?: string; medicalPointName?: string; estimatedDemand?: number; capacityStatus?: string; impactLevel: FenixImpactLevel; reason: string };
export type FenixActionPlanItem = { id: string; priority: "low" | "medium" | "high" | "critical"; module: "ATLAS" | "TALOS" | "HERMES" | "ARCA" | "NEXUS" | "AURA" | "ORACULO" | "VIGIA" | "CUSTOS"; action: string; reason: string; requiresHumanApproval: boolean };
export type FenixScenarioWarning = { id: string; severity: "low" | "medium" | "high" | "critical"; message: string; sourceModule?: string };

export type FenixScenarioOutputs = {
  estimatedAffectedAreaKm2?: number;
  estimatedExposedPopulation?: number;
  estimatedEvacuationDemand?: number;
  estimatedMedicalDemand?: number;
  estimatedShelterDemand?: number;
  estimatedLogisticsDemand?: number;
  routeImpacts: FenixRouteImpact[];
  shelterImpacts: FenixShelterImpact[];
  resourceImpacts: FenixResourceImpact[];
  medicalImpacts: FenixMedicalImpact[];
  actionPlan: FenixActionPlanItem[];
  warnings: FenixScenarioWarning[];
  generatedAt: string;
};

export type FenixScenario = {
  id: string;
  name: string;
  description: string;
  type: FenixScenarioType;
  status: FenixScenarioStatus;
  baseEventId?: string;
  talosAssessmentId?: string;
  location: { lat?: number; lng?: number; label?: string; radiusMeters?: number; isApproximate?: boolean };
  assumptions: FenixScenarioAssumption[];
  inputs: FenixScenarioInputs;
  outputs?: FenixScenarioOutputs;
  confidence: FenixConfidence;
  createdAt: string;
  updatedAt: string;
};

export type FenixFeature =
  | "view_dashboard"
  | "view_scenarios"
  | "create_scenario"
  | "run_scenario"
  | "compare_scenarios"
  | "view_evacuation"
  | "view_route_impacts"
  | "view_shelter_demand"
  | "view_resource_demand"
  | "view_medical_impact"
  | "view_confidence_details"
  | "generate_action_plan"
  | "send_to_atlas"
  | "export_scenario_report"
  | "view_sensitive_operational_context";

export type FenixRoleContext = { id?: string; role: ArgusRole };
