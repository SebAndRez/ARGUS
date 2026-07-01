export type SensorSafetyModule =
  | "QUAKESENSE"
  | "ROADSENSE"
  | "FALLSENSE"
  | "ROUTE_GUARDIAN"
  | "DEAD_MAN_SWITCH"
  | "BLACK_BOX"
  | "SAFETY_CHECK";

export type SensorSafetyPlatform =
  | "WEB_PWA"
  | "ANDROID_NATIVE"
  | "IOS_NATIVE"
  | "UNKNOWN";

export type SensorSafetyAppState =
  | "OPEN"
  | "MINIMIZED"
  | "BACKGROUND"
  | "TERMINATED_RELAUNCHED"
  | "UNKNOWN";

export type SensorSafetyDetectionType =
  | "EARTHQUAKE_SHAKE"
  | "VEHICLE_CRASH"
  | "VEHICLE_ROLLOVER"
  | "HARD_BRAKE"
  | "ROUTE_STOP_ANOMALY"
  | "ROUTE_DEVIATION"
  | "HARD_FALL"
  | "NO_RESPONSE"
  | "MANUAL_SOS"
  | "DEMO";

export type SensorSafetyDetectionStatus =
  | "LOCAL_ONLY"
  | "PRELIMINARY"
  | "CHECK_IN_REQUIRED"
  | "USER_SAFE"
  | "USER_NEEDS_HELP"
  | "USER_INJURED"
  | "USER_TRAPPED"
  | "NO_RESPONSE"
  | "ESCALATED"
  | "DISMISSED"
  | "OFFICIAL_CORRELATED"
  | "RESOLVED";

export type SensorSafetyCheckStatus =
  | "NOT_STARTED"
  | "NOTIFIED"
  | "BLOCKING_MODAL_SHOWN"
  | "USER_SAFE"
  | "NEED_HELP"
  | "INJURED"
  | "TRAPPED"
  | "CANNOT_MOVE"
  | "FALSE_ALARM"
  | "NO_RESPONSE"
  | "ESCALATED"
  | "CANCELED"
  | "RESOLVED";

export type SensorSafetyResponse =
  | "I_AM_SAFE"
  | "NEED_HELP"
  | "INJURED"
  | "TRAPPED"
  | "CANNOT_MOVE"
  | "WITH_OTHERS"
  | "FALSE_ALARM"
  | "NO_RESPONSE";

export type RoadSenseVehicleState =
  | "UNKNOWN"
  | "NOT_IN_VEHICLE"
  | "POSSIBLY_IN_VEHICLE"
  | "IN_VEHICLE"
  | "STATIONARY_AFTER_MOVEMENT";

export type RoadSenseEventType =
  | "POSSIBLE_CRASH"
  | "POSSIBLE_ROLLOVER"
  | "HARD_BRAKE"
  | "SUDDEN_STOP"
  | "ROUTE_EXIT"
  | "FALSE_ALARM";

export type FallSenseEventType =
  | "POSSIBLE_FALL"
  | "HARD_IMPACT"
  | "NO_MOVEMENT_AFTER_FALL"
  | "FALSE_ALARM";

export type RouteGuardianStatus =
  | "DISABLED"
  | "ACTIVE"
  | "ARRIVED"
  | "DELAYED"
  | "STOPPED_UNEXPECTEDLY"
  | "DEVIATED"
  | "CHECK_IN_REQUIRED"
  | "ESCALATED";

export type DeadManSwitchStatus =
  | "DISABLED"
  | "ACTIVE"
  | "CHECK_IN_DUE"
  | "MISSED_CHECK_IN"
  | "ESCALATED"
  | "CANCELED";

export type SensorSample = {
  timestamp: number;
  accelerationMagnitude: number;
  rotationRate?: number;
};

export type GpsContext = {
  speedBeforeKmh?: number;
  speedAfterKmh?: number;
  stoppedAfterMovement?: boolean;
  distanceFromRouteMeters?: number;
};

export type BlackBoxEvent = {
  id: string;
  detectionId: string;
  createdAt: string;
  module: SensorSafetyModule;
  appState: SensorSafetyAppState;
  peakAcceleration: number;
  rotationPeak?: number;
  speedBeforeKmh?: number;
  speedAfterKmh?: number;
  approximateLat?: number;
  approximateLng?: number;
  accuracyBand?: "none" | "city" | "district" | "coarse" | "unknown";
  batteryLevel?: number;
  networkStatus?: "online" | "slow" | "offline" | "unknown";
  localOnly: boolean;
  userConsent: boolean;
  isDemo: boolean;
};

export type SensorSafetyDetection = {
  id: string;
  userId?: string;
  deviceSessionIdHash: string;
  module: SensorSafetyModule;
  type: SensorSafetyDetectionType;
  status: SensorSafetyDetectionStatus;
  detectedAt: string;
  confidence: number;
  severity: "low" | "medium" | "high" | "critical";
  appState: SensorSafetyAppState;
  platform: SensorSafetyPlatform;
  approximateLat?: number;
  approximateLng?: number;
  accuracyBand?: "none" | "city" | "district" | "coarse" | "unknown";
  blackBoxEvent?: BlackBoxEvent;
  checkInId?: string;
  isDemo: boolean;
  argusSummary: string;
  recommendedAction: string;
};

export type SensorSafetyCheckIn = {
  id: string;
  detectionId: string;
  status: SensorSafetyCheckStatus;
  createdAt: string;
  deadlineAt: string;
  response?: SensorSafetyResponse;
  approximateLat?: number;
  approximateLng?: number;
  accuracyBand?: "none" | "city" | "district" | "coarse" | "unknown";
  escalationAllowed: boolean;
  auraAllowed: boolean;
  missingPersonCandidateAllowed: boolean;
  isDemo: boolean;
};

export type SensorSafetySettings = {
  userId: string;
  enabled: boolean;
  enabledModules: SensorSafetyModule[];
  allowBackgroundSensor: boolean;
  allowApproxLocationOnEmergency: boolean;
  allowEmergencyContacts: boolean;
  allowCommandCenterEscalation: boolean;
  allowMissingPersonCandidate: boolean;
  allowAuraMedicalAid: boolean;
  allowBlackBox: boolean;
  checkInTimeoutSeconds: number;
  deadManSwitchIntervalMinutes: number;
  roadSenseSensitivity: "low" | "medium" | "high";
  fallSenseSensitivity: "low" | "medium" | "high";
  quakeSenseSensitivity: "low" | "medium" | "high";
  routeGuardianEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};
