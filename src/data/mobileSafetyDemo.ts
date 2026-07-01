import type {
  MobileQuakeDetectionEvent,
  MobileSafetySettings,
  SafetyCheck,
} from "@/types/mobileSafety";

const now = new Date("2026-06-30T12:00:00.000Z").toISOString();

export const demoMobileSafetySettings: MobileSafetySettings = {
  userId: "demo-mobile-user",
  enabled: true,
  platform: "WEB_PWA",
  allowBackgroundSensor: false,
  allowApproxLocationOnEmergency: true,
  allowEmergencyContacts: true,
  allowCommandCenterEscalation: true,
  allowMissingPersonCandidate: true,
  checkInTimeoutSeconds: 90,
  sensitivity: "medium",
  createdAt: now,
  updatedAt: now,
};

export const demoMobileQuakeEvent: MobileQuakeDetectionEvent = {
  id: "demo-mobile-quake-001",
  deviceSessionIdHash: "demo-session-hash",
  detectedAt: now,
  platform: "WEB_PWA",
  appState: "OPEN",
  peakAcceleration: 15.4,
  confidence: 72,
  localOnly: false,
  sentToServer: true,
  approximateLat: -33.4489,
  approximateLng: -70.6693,
  accuracyBand: "district",
  batteryLevel: 82,
  networkStatus: "online",
  source: "mobile_safety_agent",
  isDemo: true,
};

export const demoSafetyChecks: SafetyCheck[] = [
  {
    id: "demo-safety-check-001",
    userId: "demo-mobile-user",
    triggerEventId: demoMobileQuakeEvent.id,
    status: "NOTIFIED",
    createdAt: now,
    notificationSentAt: now,
    timeoutSeconds: 90,
    lastApproxLat: -33.4489,
    lastApproxLng: -70.6693,
    lastAccuracyBand: "district",
    batteryLevel: 82,
    networkStatus: "online",
    emergencyContactsNotified: false,
    commandCenterVisible: true,
    missingPersonCandidate: false,
    notes:
      "Check-in demo creado por ARGUS Mobile Safety Agent. Requiere respuesta manual.",
    isDemo: true,
  },
];
