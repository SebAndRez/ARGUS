/**
 * ARGUS VIGÍA: reportes ciudadanos, evidencia de terreno, validación
 * comunitaria, reputación y trazabilidad. VIGÍA recolecta, estructura y
 * canaliza evidencia ciudadana; no simula (FÉNIX), no calcula riesgo
 * avanzado (TALOS) y no valida fuentes abiertas completas (ORÁCULO).
 */

export type VigiaReportType =
  | "fire"
  | "smoke"
  | "earthquake_damage"
  | "flood"
  | "landslide"
  | "road_block"
  | "traffic_accident"
  | "medical_emergency"
  | "public_disorder"
  | "infrastructure_damage"
  | "power_outage"
  | "missing_person_context"
  | "animal_risk"
  | "other";

export type VigiaReportStatus =
  | "draft"
  | "submitted"
  | "pending_validation"
  | "under_review"
  | "confirmed"
  | "rejected"
  | "duplicate"
  | "escalated"
  | "resolved";

export type VigiaSeverity = "low" | "medium" | "high" | "critical";

export type VigiaConfidence = "unknown" | "low" | "medium" | "high" | "verified";

export interface VigiaLocation {
  lat: number;
  lng: number;
  accuracyMeters?: number;
  label?: string;
  isApproximate?: boolean;
}

export interface VigiaReporter {
  id: string;
  alias: string;
  role: string;
  reputationScore: number;
  isVerified: boolean;
}

export type VigiaEvidenceType = "photo" | "video" | "audio" | "text" | "sensor" | "external_link";
export type VigiaEvidenceVerification = "unverified" | "pending" | "verified" | "rejected";

export interface VigiaEvidence {
  id: string;
  type: VigiaEvidenceType;
  url?: string;
  filename?: string;
  description?: string;
  capturedAt?: string;
  uploadedAt: string;
  metadata?: {
    sizeBytes?: number;
    mimeType?: string;
    durationSeconds?: number;
  };
  verificationStatus: VigiaEvidenceVerification;
}

export type VigiaReportSource = "citizen" | "institution" | "emergency_responder" | "admin";

export interface VigiaReport {
  id: string;
  type: VigiaReportType;
  title: string;
  description: string;
  severity: VigiaSeverity;
  status: VigiaReportStatus;
  confidence: VigiaConfidence;
  location: VigiaLocation;
  reporter: VigiaReporter;
  evidence: VigiaEvidence[];
  createdAt: string;
  updatedAt: string;
  source: VigiaReportSource;
  linkedEventId?: string;
  linkedAtlasIncidentId?: string;
  tags?: string[];
  moderationNotes?: string;
  duplicateOfReportId?: string;
  isDemo?: boolean;
}

export interface VigiaValidationResult {
  confidence: VigiaConfidence;
  suggestedStatus: VigiaReportStatus;
  score: number;
  reasons: string[];
  flags: string[];
}

export type VigiaReporterStanding = "trusted" | "normal" | "observed" | "limited" | "blocked";

export type VigiaFeature =
  | "view"
  | "create_report"
  | "upload_evidence"
  | "validate_report"
  | "escalate_report"
  | "moderate_report"
  | "view_reputation"
  | "view_sensitive_details";

export interface VigiaAtlasSummary {
  total: number;
  pending: number;
  critical: number;
  confirmed: number;
  duplicates: number;
  withEvidence: number;
  recent: number;
  bySeverity: Record<VigiaSeverity, number>;
  byType: Partial<Record<VigiaReportType, number>>;
}

export interface VigiaReputationSummary {
  standing: VigiaReporterStanding;
  score: number;
  reportsSubmitted: number;
  reportsConfirmed: number;
  warnings: number;
  strikes: number;
  canCreateNormalReports: boolean;
  canCreateSos: true;
}
