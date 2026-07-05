/**
 * ARGUS TALOS: motor transversal de riesgo, amenaza, severidad y prioridad
 * operacional. TALOS calcula, explica y prioriza — no simula (FÉNIX), no
 * calcula rutas (HERMES), no gestiona logística (NEXUS) y nunca emite
 * órdenes oficiales ni reemplaza protocolos institucionales.
 */

export type TalosRiskLevel = "minimal" | "low" | "medium" | "high" | "critical";

export type TalosConfidenceLevel = "unknown" | "low" | "medium" | "high" | "verified";

export type TalosImpactLevel = "minor" | "moderate" | "major" | "severe" | "catastrophic";

export type TalosEscalationLikelihood = "unlikely" | "possible" | "likely" | "imminent" | "active";

export type TalosEventCategory =
  | "fire"
  | "earthquake"
  | "tsunami"
  | "flood"
  | "landslide"
  | "volcano"
  | "weather"
  | "infrastructure"
  | "medical"
  | "traffic"
  | "public_security"
  | "conflict"
  | "humanitarian"
  | "other";

export type TalosRiskFactorType =
  | "severity"
  | "population_exposure"
  | "source_confidence"
  | "citizen_reports"
  | "infrastructure"
  | "weather"
  | "proximity"
  | "mobility"
  | "medical"
  | "shelter"
  | "logistics"
  | "contradiction"
  | "time";

export interface TalosRiskFactor {
  id: string;
  label: string;
  type: TalosRiskFactorType;
  weight: number;
  contribution: number;
  direction: "increases_risk" | "reduces_risk" | "neutral";
  explanation: string;
}

export type TalosRecommendationModuleId =
  | "argus-atlas"
  | "argus-vigia"
  | "argus-oraculo"
  | "argus-hermes"
  | "argus-arca"
  | "argus-aura"
  | "argus-nexus"
  | "argus-fenix"
  | "argus-custos";

export interface TalosModuleRecommendation {
  moduleId: TalosRecommendationModuleId;
  moduleName: string;
  priority: "low" | "medium" | "high" | "critical";
  reason: string;
  requiresRole?: string[];
}

export interface TalosLocation {
  lat?: number;
  lng?: number;
  label?: string;
  isApproximate?: boolean;
}

export interface TalosSourceSummary {
  vigiaReports: number;
  oraculoEvidence: number;
  officialSources: number;
  citizenSources: number;
  contradictionCount: number;
}

export interface TalosRiskAssessment {
  id: string;
  eventId: string;
  title: string;
  category: TalosEventCategory;
  riskLevel: TalosRiskLevel;
  riskScore: number;
  confidence: TalosConfidenceLevel;
  impact: TalosImpactLevel;
  escalationLikelihood: TalosEscalationLikelihood;
  priorityRank: number;
  location?: TalosLocation;
  factors: TalosRiskFactor[];
  recommendations: TalosModuleRecommendation[];
  explanation: string;
  generatedAt: string;
  updatedAt: string;
  sourceSummary: TalosSourceSummary;
  isDemo?: boolean;
}

export interface TalosAssessmentEventInput {
  id: string;
  title: string;
  category: TalosEventCategory;
  severity?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  location?: TalosLocation;
}

export interface TalosAssessmentContext {
  populationExposureEstimate?: number;
  nearCriticalInfrastructure?: boolean;
  nearShelters?: boolean;
  routesAffected?: boolean;
  weatherRisk?: "none" | "low" | "medium" | "high" | "critical";
  medicalImpact?: "none" | "low" | "medium" | "high" | "critical";
  logisticsImpact?: "none" | "low" | "medium" | "high" | "critical";
}

export interface TalosVigiaSignal {
  reportCount: number;
  confirmedCount: number;
  criticalCount: number;
  recentCount: number;
  averageReputation: number;
  reportsWithEvidence: number;
  possibleDuplicates: number;
  location?: TalosLocation;
  category?: string;
}

export interface TalosOraculoSignal {
  verifiedCount: number;
  averageConfidenceScore: number;
  officialSourceCount: number;
  citizenSourceCount: number;
  contradictionCount: number;
  oldestEvidenceHours: number | null;
  location?: TalosLocation;
  category?: string;
  hasLicensePendingSource: boolean;
}

export interface TalosAssessmentInput {
  event: TalosAssessmentEventInput;
  vigiaSignal?: TalosVigiaSignal;
  oraculoSignal?: TalosOraculoSignal;
  context?: TalosAssessmentContext;
}

export type TalosFeature =
  | "view_public_summary"
  | "view_dashboard"
  | "view_full_assessment"
  | "view_explanations"
  | "view_source_factors"
  | "run_assessment"
  | "override_assessment"
  | "send_to_atlas"
  | "send_to_fenix"
  | "export_report"
  | "view_sensitive_context";

export interface TalosAtlasSummary {
  criticalEvents: number;
  highEvents: number;
  topPriorityAssessmentId: string | null;
  averageRiskScore: number;
  recentAssessments: number;
  recommendedModules: string[];
  lowConfidenceEvents: number;
  eventsWithContradictions: number;
}

export interface TalosHermesSignal {
  assessmentId: string;
  routesPossiblyAffected: boolean;
  mobilitySeverity: TalosRiskLevel;
  evacuationNeeded: boolean;
  priority: "low" | "medium" | "high" | "critical";
  approximateZone?: TalosLocation;
}

export interface TalosArcaSignal {
  assessmentId: string;
  possibleShelterNeed: boolean;
  evacuationLevel: "none" | "partial" | "full";
  exposedPopulationEstimate?: number;
  priority: "low" | "medium" | "high" | "critical";
  approximateZone?: TalosLocation;
}

export interface TalosAuraSignal {
  assessmentId: string;
  estimatedMedicalImpact: "none" | "low" | "medium" | "high" | "critical";
  sanitaryPriority: "low" | "medium" | "high" | "critical";
  eventType: TalosEventCategory;
  recommendsMedicalReview: boolean;
}

export interface TalosNexusSignal {
  assessmentId: string;
  logisticsNeed: boolean;
  probableResources: string[];
  supplyPriority: "low" | "medium" | "high" | "critical";
  approximateZone?: TalosLocation;
  routesImpact: boolean;
}

export interface TalosFenixSignal {
  assessmentId: string;
  eventId: string;
  category: TalosEventCategory;
  riskLevel: TalosRiskLevel;
  impact: TalosImpactLevel;
  escalationLikelihood: TalosEscalationLikelihood;
  approximateZone?: TalosLocation;
  factors: TalosRiskFactor[];
  confidence: TalosConfidenceLevel;
  missingData: string[];
}
