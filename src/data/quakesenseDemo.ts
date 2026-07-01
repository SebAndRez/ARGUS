import type { QuakeSenseCitizenSignal, QuakeSenseCluster } from "@/types/quakesense";

const now = "2026-06-30T00:00:00.000Z";

export const demoQuakeSenseSignals: QuakeSenseCitizenSignal[] = [
  {
    id: "qs-demo-signal-1",
    sessionIdHash: "demo-session-a",
    detectedAt: now,
    latRounded: -33.45,
    lngRounded: -70.66,
    accuracyBand: "district",
    peakAcceleration: 12.4,
    confidence: 62,
    userConsent: true,
    source: "citizen_sensor",
    isDemo: true,
  },
  {
    id: "qs-demo-signal-2",
    sessionIdHash: "demo-session-b",
    detectedAt: now,
    latRounded: -33.46,
    lngRounded: -70.65,
    accuracyBand: "district",
    peakAcceleration: 10.1,
    confidence: 58,
    userConsent: true,
    source: "citizen_sensor",
    isDemo: true,
  },
  {
    id: "qs-demo-signal-3",
    sessionIdHash: "demo-session-c",
    detectedAt: now,
    latRounded: -33.44,
    lngRounded: -70.67,
    accuracyBand: "district",
    peakAcceleration: 11.8,
    confidence: 64,
    userConsent: true,
    source: "citizen_sensor",
    isDemo: true,
  },
];

export const demoQuakeSenseCluster: QuakeSenseCluster = {
  id: "qs-demo-cluster-santiago",
  centerLat: -33.45,
  centerLng: -70.66,
  radiusKm: 6,
  signalCount: demoQuakeSenseSignals.length,
  windowSeconds: 20,
  confidence: 54,
  severity: "low",
  firstDetectedAt: now,
  lastDetectedAt: now,
  status: "POSSIBLE_SHAKE",
  argusSummary:
    "Alerta preliminar demo: posible sacudida detectada por red ciudadana de sensores. Estimacion ARGUS, pendiente de confirmacion oficial.",
  recommendedAction:
    "Si sientes movimiento, agachate, cubrete y afirmate. No reemplaza CSN, SENAPRED, SHOA, USGS ni fuentes oficiales.",
  isDemo: true,
};
