/**
 * ARGUS ORÁCULO: fusión de fuentes abiertas, evidencia, confiabilidad,
 * contradicciones y trazabilidad. ORÁCULO no decide evacuaciones (HERMES/
 * TALOS/ATLAS/FÉNIX), no simula crisis (FÉNIX) y no calcula riesgo
 * operacional completo (TALOS). Entrega evidencia limpia, trazable y
 * explicable.
 */

export type OraculoSourceCategory =
  | "earthquake"
  | "weather"
  | "wildfire"
  | "flood"
  | "volcano"
  | "tsunami"
  | "humanitarian"
  | "conflict"
  | "infrastructure"
  | "citizen_report"
  | "institutional"
  | "sensor"
  | "news"
  | "other";

export type OraculoSourceType =
  | "official"
  | "government"
  | "international_organization"
  | "academic"
  | "ngo"
  | "commercial"
  | "media"
  | "citizen"
  | "internal"
  | "sensor"
  | "manual";

export type OraculoSourceStatus =
  | "active"
  | "inactive"
  | "degraded"
  | "manual_review"
  | "disabled"
  | "planned";

export type OraculoReliabilityTier =
  | "tier_1_official"
  | "tier_2_institutional"
  | "tier_3_verified_osint"
  | "tier_4_media"
  | "tier_5_citizen"
  | "unknown";

export type OraculoCommercialUseStatus = "allowed" | "restricted" | "requires_review" | "unknown";

export interface OraculoSource {
  id: string;
  name: string;
  shortName: string;
  category: OraculoSourceCategory;
  sourceType: OraculoSourceType;
  description: string;
  homepage?: string;
  status: OraculoSourceStatus;
  reliabilityTier: OraculoReliabilityTier;
  updateFrequency?: string;
  coverage: "global" | "regional" | "national" | "local";
  requiresApiKey: boolean;
  requiresLicenseReview: boolean;
  commercialUseStatus: OraculoCommercialUseStatus;
  attributionRequired: boolean;
  lastCheckedAt?: string;
  notes?: string;
}

export type OraculoConfidenceLevel = "unknown" | "low" | "medium" | "high" | "verified";

export type OraculoVerificationStatus =
  | "unverified"
  | "pending_review"
  | "partially_verified"
  | "verified"
  | "rejected";

export type OraculoContradictionStatus = "none" | "possible" | "confirmed" | "requires_review";

export type OraculoRelatedModule =
  | "ATLAS"
  | "VIGIA"
  | "TALOS"
  | "FENIX"
  | "HERMES"
  | "ARCA"
  | "AURA"
  | "NEXUS"
  | "CUSTOS";

export interface OraculoEvidenceLocation {
  lat?: number;
  lng?: number;
  label?: string;
  country?: string;
  region?: string;
  isApproximate?: boolean;
}

export interface OraculoEvidence {
  id: string;
  title: string;
  summary: string;
  sourceId: string;
  sourceName: string;
  sourceType: OraculoSourceType;
  category: OraculoSourceCategory;
  relatedEventId?: string;
  relatedReportId?: string;
  relatedModule?: OraculoRelatedModule;
  observedAt?: string;
  publishedAt?: string;
  collectedAt: string;
  location?: OraculoEvidenceLocation;
  confidence: OraculoConfidenceLevel;
  reliabilityScore: number;
  verificationStatus: OraculoVerificationStatus;
  contradictionStatus: OraculoContradictionStatus;
  tags: string[];
  rawReference?: string;
  attribution?: string;
  notes?: string;
  isDemo?: boolean;
}

export interface OraculoScoringResult {
  score: number;
  confidence: OraculoConfidenceLevel;
  reasons: string[];
  penalties: string[];
  requiresHumanReview: boolean;
}

export type OraculoContradictionType =
  | "severity_mismatch"
  | "location_mismatch"
  | "time_mismatch"
  | "status_mismatch"
  | "source_conflict"
  | "duplicate_conflict";

export interface OraculoContradiction {
  id: string;
  evidenceIds: string[];
  type: OraculoContradictionType;
  severity: "low" | "medium" | "high";
  summary: string;
  recommendation: string;
  requiresHumanReview: boolean;
}

export type OraculoFeature =
  | "view_dashboard"
  | "view_sources"
  | "view_evidence"
  | "view_contradictions"
  | "verify_evidence"
  | "reject_evidence"
  | "manage_sources"
  | "export_trace"
  | "send_to_talos"
  | "send_to_atlas"
  | "view_sensitive_internal_notes";

export interface OraculoAtlasSummary {
  activeSources: number;
  averageConfidence: number;
  criticalEvidenceCount: number;
  openContradictions: number;
  eventsWithInsufficientEvidence: number;
  eventsWithStrongEvidence: number;
  degradedSources: number;
}

export interface OraculoTalosEvidencePacket {
  evidenceId: string;
  category: OraculoSourceCategory;
  reliabilityScore: number;
  hasLocation: boolean;
  observedAt?: string;
  collectedAt: string;
  contradictionIds: string[];
  warnings: string[];
}

export interface OraculoFenixEvidencePacket {
  evidenceId: string;
  title: string;
  summary: string;
  category: OraculoSourceCategory;
  location?: OraculoEvidenceLocation;
  collectedAt: string;
  reliabilityScore: number;
  tags: string[];
}

export interface OraculoConnector {
  id: string;
  sourceId: string;
  name: string;
  enabled: boolean;
  requiresApiKey: boolean;
  fetchLatest?: () => Promise<OraculoEvidence[]>;
}
