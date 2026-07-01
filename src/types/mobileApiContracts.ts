export type MobileCapability =
  | "BACKGROUND_ACCELEROMETER"
  | "BACKGROUND_LOCATION"
  | "FOREGROUND_SERVICE"
  | "PUSH_NOTIFICATIONS"
  | "OFFLINE_QUEUE"
  | "LOCAL_ENCRYPTION"
  | "SAFETY_CHECK"
  | "ROAD_SENSE"
  | "QUAKE_SENSE"
  | "FALL_SENSE";

export type MobilePlatform = "ANDROID" | "IOS" | "WEB_PWA" | "UNKNOWN";

export type MobileEventModule =
  | "QUAKESENSE"
  | "ROADSENSE"
  | "FALLSENSE"
  | "ROUTE_GUARDIAN"
  | "DEAD_MAN_SWITCH"
  | "SAFETY_CHECK"
  | "AURA";

export type MobilePushMessageType =
  | "SAFETY_CHECK"
  | "POSSIBLE_QUAKE"
  | "POSSIBLE_CRASH"
  | "POSSIBLE_FALL"
  | "ROUTE_CHECK"
  | "DEAD_MAN_CHECK"
  | "COMMAND_ALERT"
  | "TEST";

export interface MobileDeviceRegistration {
  deviceIdHash: string;
  userId?: string;
  platform: MobilePlatform;
  appVersion: string;
  pushTokenHash?: string;
  capabilities: MobileCapability[];
  createdAt: string;
}

export interface MobileEventPayload {
  deviceIdHash: string;
  userId?: string;
  eventType: string;
  module: MobileEventModule;
  detectedAt: string;
  confidence: number;
  severity: "low" | "medium" | "high" | "critical";
  appState: "OPEN" | "MINIMIZED" | "BACKGROUND" | "TERMINATED_RELAUNCHED" | "UNKNOWN";
  location?: {
    latitude: number;
    longitude: number;
    accuracyBand: "none" | "city" | "district" | "coarse" | "unknown";
  };
  batteryLevel?: number;
  networkStatus?: "online" | "slow" | "offline" | "unknown";
  blackBox?: {
    peakAcceleration?: number;
    rotationPeak?: number;
    localOnly: boolean;
  };
  consentVersion: string;
  isDemo: boolean;
}

export interface MobileSafetyCheckPayload {
  checkInId: string;
  response: "I_AM_SAFE" | "NEED_HELP" | "INJURED" | "TRAPPED" | "CANNOT_MOVE" | "WITH_OTHERS" | "FALSE_ALARM" | "NO_RESPONSE";
  respondedAt: string;
  location?: {
    latitude: number;
    longitude: number;
    accuracyBand: "none" | "city" | "district" | "coarse" | "unknown";
  };
  batteryLevel?: number;
  networkStatus?: "online" | "slow" | "offline" | "unknown";
}
