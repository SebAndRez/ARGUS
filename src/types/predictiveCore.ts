export type ArgusInputKind =
  | "citizen_report"
  | "sos"
  | "official_event"
  | "external_event"
  | "earthquake"
  | "tsunami"
  | "fire"
  | "weather"
  | "flood"
  | "volcano"
  | "conflict"
  | "medical"
  | "route"
  | "camera"
  | "sensor"
  | "fenix"
  | "system";

export type ArgusSourceAuthority =
  | "official"
  | "open_data"
  | "citizen"
  | "argus_estimate"
  | "institutional"
  | "system"
  | "unknown";

export type ArgusPredictionStatus =
  | "watch"
  | "verifying"
  | "possible"
  | "probable"
  | "confirmed_by_official_source"
  | "reduced"
  | "dismissed"
  | "insufficient_data";

export type ArgusEvidenceLevel =
  | "primary"
  | "supporting"
  | "historical"
  | "contextual"
  | "derived";

export type ArgusPredictionAudience =
  | "public"
  | "operator"
  | "admin"
  | "institutional";

export interface ArgusPredictionInput {
  id: string;
  kind: ArgusInputKind;
  sourceAuthority: ArgusSourceAuthority;
  sourceId?: string;
  sourceName?: string;
  title: string;
  summary?: string;
  latitude?: number;
  longitude?: number;
  region?: string;
  countryCode?: string;
  occurredAt?: string;
  receivedAt: string;
  severityHint?: string;
  raw?: unknown;
}

export interface ArgusPredictionClassification {
  inputId: string;
  kind: ArgusInputKind;
  normalizedType: string;
  sourceAuthority: ArgusSourceAuthority;
  baseSeverity: "P0" | "P1" | "P2" | "P3" | "P4";
  scope: "LOCAL" | "NATIONAL" | "INTERNATIONAL" | "GLOBAL";
  needsConfirmation: boolean;
  isOfficialPrimaryEvidence: boolean;
  confidenceSeed: number;
  reasons: string[];
}

export interface ArgusPredictionEvidence {
  id: string;
  label: string;
  description: string;
  level: ArgusEvidenceLevel;
  sourceName?: string;
  sourceAuthority?: ArgusSourceAuthority;
  weight: number;
  url?: string;
  observedAt?: string;
  relatedInputId?: string;
}

export interface ArgusPredictionContext {
  inputId: string;
  nearbyEvents: unknown[];
  nearbyReports: unknown[];
  relatedOfficialEvents: unknown[];
  relatedOpenDataEvents: unknown[];
  relatedCameras: unknown[];
  weatherContext: unknown | null;
  historicalContext: unknown[];
  routeContext: unknown[];
  medicalContext: unknown[];
  knowledgeFacts: unknown[];
  sourceHealthContext: unknown[];
}

export interface ArgusPredictionResult {
  id: string;
  inputId: string;
  title: string;
  analysisTitle: string;
  status: ArgusPredictionStatus;
  primaryMode: "official" | "citizen" | "hybrid" | "system";
  probabilityLabel: "muy baja" | "baja" | "media" | "alta" | "muy alta";
  probabilityScore: number;
  confidence: number;
  uncertainty: "baja" | "media" | "alta";
  severity: "P0" | "P1" | "P2" | "P3" | "P4";
  hypothesis: string;
  summary: string;
  explanation: string;
  recommendedAction: string;
  publicMessage: string;
  operatorMessage: string;
  limitations: string[];
  evidence: ArgusPredictionEvidence[];
  nearbyUserAlertEligible: boolean;
  notificationEligible: boolean;
  fenixEligible: boolean;
  commandCenterEligible: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ArgusDecisionPacket {
  analysis: ArgusPredictionResult;
  notification?: {
    title: string;
    body: string;
    severity: string;
    actionUrl?: string;
  };
  mapFocus?: {
    latitude: number;
    longitude: number;
    zoom?: number;
  };
  fenixSeed?: {
    latitude: number;
    longitude: number;
    hazardType: string;
    severity: string;
    confidence: number;
  };
  commandCenterHint?: {
    priority: string;
    suggestedQueue: string;
    requiresHumanValidation: boolean;
  };
}
