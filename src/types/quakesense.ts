export type QuakeSenseStatus =
  | "UNSUPPORTED"
  | "PERMISSION_REQUIRED"
  | "READY"
  | "LISTENING"
  | "POSSIBLE_SHAKE"
  | "CLUSTER_DETECTED"
  | "OFFICIAL_CORRELATED"
  | "DISABLED"
  | "ERROR";

export type QuakeSensePermissionState =
  | "UNKNOWN"
  | "GRANTED"
  | "DENIED"
  | "REQUIRED"
  | "UNSUPPORTED";

export type QuakeSenseClusterStatus =
  | "POSSIBLE_SHAKE"
  | "MULTI_DEVICE_PATTERN"
  | "OFFICIAL_CORRELATED"
  | "DISMISSED";

export type QuakeSenseSeverity = "isolated" | "low" | "medium" | "high";

export type QuakeSenseLocalSample = {
  timestamp: number;
  accelerationX: number;
  accelerationY: number;
  accelerationZ: number;
  accelerationMagnitude: number;
  accelerationIncludingGravityMagnitude?: number;
  rotationRate?: {
    alpha?: number | null;
    beta?: number | null;
    gamma?: number | null;
  };
  interval?: number;
};

export type QuakeSenseDetection = {
  id: string;
  detectedAt: string;
  peakAcceleration: number;
  durationMs: number;
  sampleCount: number;
  confidence: number;
  deviceState: "unknown" | "stationary_hint" | "moving";
  isLikelyHumanMotion: boolean;
  isLikelyVehicleMotion: boolean;
  isPossibleSeismicMotion: boolean;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  source: "device_motion";
  status: QuakeSenseStatus;
};

export type QuakeSenseCitizenSignal = {
  id: string;
  sessionIdHash: string;
  detectedAt: string;
  latRounded?: number;
  lngRounded?: number;
  geohashApprox?: string;
  accuracyBand: "none" | "city" | "district" | "coarse" | "unknown";
  peakAcceleration: number;
  confidence: number;
  userConsent: boolean;
  source: "citizen_sensor";
  isDemo?: boolean;
};

export type QuakeSenseCluster = {
  id: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  signalCount: number;
  windowSeconds: number;
  confidence: number;
  severity: QuakeSenseSeverity;
  firstDetectedAt: string;
  lastDetectedAt: string;
  status: QuakeSenseClusterStatus;
  officialCorrelation?: {
    sourceName: string;
    status: "pending" | "correlated" | "dismissed";
    observedAt?: string;
  };
  argusSummary: string;
  recommendedAction: string;
  isDemo?: boolean;
};

export type QuakeSenseSettings = {
  enabled: boolean;
  shareApproxLocation: boolean;
  shareOnlyOnDetection: boolean;
  sensitivity: "low" | "medium" | "high";
  minConfidenceToReport: number;
  requireStationaryHint: boolean;
};

export type QuakeSenseDetectorResult = {
  detection: QuakeSenseDetection | null;
  peakAcceleration: number;
  durationMs: number;
  sampleCount: number;
  confidence: number;
  reason: string;
};
