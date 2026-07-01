export type MobileSafetyMode =
  | "DISABLED"
  | "ENABLED"
  | "PAUSED"
  | "EMERGENCY_ONLY"
  | "TEST_MODE";

export type MobileSafetyPlatform =
  | "ANDROID_NATIVE"
  | "IOS_NATIVE"
  | "WEB_PWA"
  | "UNKNOWN";

export type MobileSafetyCapability =
  | "BACKGROUND_ACCELEROMETER"
  | "FOREGROUND_SERVICE"
  | "PUSH_NOTIFICATION"
  | "CRITICAL_ALERT"
  | "BACKGROUND_LOCATION"
  | "OFFLINE_QUEUE"
  | "LOCAL_SIREN"
  | "SAFETY_CHECK";

export type SafetyCheckStatus =
  | "NOT_STARTED"
  | "NOTIFIED"
  | "OPENED"
  | "USER_SAFE"
  | "USER_NEEDS_HELP"
  | "USER_INJURED"
  | "USER_TRAPPED"
  | "NO_RESPONSE"
  | "ESCALATED"
  | "CANCELED"
  | "RESOLVED";

export type SafetyCheckResponse =
  | "I_AM_SAFE"
  | "NEED_HELP"
  | "INJURED"
  | "TRAPPED"
  | "CANNOT_MOVE"
  | "WITH_OTHERS"
  | "FALSE_ALARM";

export type AppState =
  | "OPEN"
  | "MINIMIZED"
  | "BACKGROUND"
  | "TERMINATED_RELAUNCHED"
  | "UNKNOWN";

export type MobileQuakeDetectionEvent = {
  id: string;
  deviceSessionIdHash: string;
  userId?: string;
  detectedAt: string;
  platform: MobileSafetyPlatform;
  appState: AppState;
  peakAcceleration: number;
  confidence: number;
  localOnly: boolean;
  sentToServer: boolean;
  approximateLat?: number;
  approximateLng?: number;
  accuracyBand?: "none" | "city" | "district" | "coarse" | "unknown";
  batteryLevel?: number;
  networkStatus?: "online" | "slow" | "offline" | "unknown";
  source: "mobile_safety_agent";
  isDemo: boolean;
};

export type SafetyCheck = {
  id: string;
  userId: string;
  triggerEventId: string;
  status: SafetyCheckStatus;
  createdAt: string;
  notificationSentAt?: string;
  openedAt?: string;
  respondedAt?: string;
  escalationAt?: string;
  timeoutSeconds: number;
  response?: SafetyCheckResponse;
  lastApproxLat?: number;
  lastApproxLng?: number;
  lastAccuracyBand?: "none" | "city" | "district" | "coarse" | "unknown";
  batteryLevel?: number;
  networkStatus?: "online" | "slow" | "offline" | "unknown";
  emergencyContactsNotified: boolean;
  commandCenterVisible: boolean;
  missingPersonCandidate: boolean;
  notes?: string;
  isDemo?: boolean;
};

export type MobileSafetyEmergencyContact = {
  id: string;
  userId: string;
  name: string;
  relationship: string;
  phone: string;
  email?: string;
  notifyOnNoResponse: boolean;
  notifyOnNeedHelp: boolean;
  createdAt: string;
};

export type MobileSafetySettings = {
  userId: string;
  enabled: boolean;
  platform: MobileSafetyPlatform;
  allowBackgroundSensor: boolean;
  allowApproxLocationOnEmergency: boolean;
  allowEmergencyContacts: boolean;
  allowCommandCenterEscalation: boolean;
  allowMissingPersonCandidate: boolean;
  checkInTimeoutSeconds: number;
  quietHours?: { start: string; end: string };
  sensitivity: "low" | "medium" | "high";
  createdAt: string;
  updatedAt: string;
};
