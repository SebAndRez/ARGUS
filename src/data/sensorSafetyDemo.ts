import type {
  SensorSafetyDetection,
  SensorSafetySettings,
} from "@/types/sensorSafety";

const now = new Date("2026-06-30T12:00:00.000Z").toISOString();

export const demoSensorSafetySettings: SensorSafetySettings = {
  userId: "demo-sensor-safety-user",
  enabled: true,
  enabledModules: [
    "QUAKESENSE",
    "ROADSENSE",
    "FALLSENSE",
    "ROUTE_GUARDIAN",
    "DEAD_MAN_SWITCH",
    "BLACK_BOX",
    "SAFETY_CHECK",
  ],
  allowBackgroundSensor: false,
  allowApproxLocationOnEmergency: true,
  allowEmergencyContacts: true,
  allowCommandCenterEscalation: true,
  allowMissingPersonCandidate: true,
  allowAuraMedicalAid: true,
  allowBlackBox: true,
  checkInTimeoutSeconds: 90,
  deadManSwitchIntervalMinutes: 15,
  roadSenseSensitivity: "medium",
  fallSenseSensitivity: "medium",
  quakeSenseSensitivity: "medium",
  routeGuardianEnabled: false,
  createdAt: now,
  updatedAt: now,
};

export const demoSensorSafetyDetections: SensorSafetyDetection[] = [
  {
    id: "sensor-demo-road-001",
    deviceSessionIdHash: "demo-sensor-session",
    module: "ROADSENSE",
    type: "VEHICLE_CRASH",
    status: "CHECK_IN_REQUIRED",
    detectedAt: now,
    confidence: 68,
    severity: "medium",
    appState: "OPEN",
    platform: "WEB_PWA",
    approximateLat: -33.4489,
    approximateLng: -70.6693,
    accuracyBand: "district",
    isDemo: true,
    argusSummary:
      "Deteccion preliminar de posible accidente vehicular. Pendiente de confirmacion.",
    recommendedAction:
      "Solicitar Safety Check y verificar con el usuario antes de escalar.",
  },
];
