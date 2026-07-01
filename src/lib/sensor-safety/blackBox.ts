import type {
  BlackBoxEvent,
  SensorSafetyDetection,
  SensorSafetySettings,
} from "@/types/sensorSafety";

export function buildBlackBoxEvent(
  detection: SensorSafetyDetection,
  context: Partial<BlackBoxEvent> = {}
): BlackBoxEvent {
  return {
    id: context.id ?? `blackbox-${detection.id}`,
    detectionId: detection.id,
    createdAt: new Date().toISOString(),
    module: detection.module,
    appState: detection.appState,
    peakAcceleration: context.peakAcceleration ?? 0,
    rotationPeak: context.rotationPeak,
    speedBeforeKmh: context.speedBeforeKmh,
    speedAfterKmh: context.speedAfterKmh,
    approximateLat: detection.approximateLat,
    approximateLng: detection.approximateLng,
    accuracyBand: detection.accuracyBand,
    batteryLevel: context.batteryLevel,
    networkStatus: context.networkStatus ?? "unknown",
    localOnly: true,
    userConsent: Boolean(context.userConsent),
    isDemo: detection.isDemo,
  };
}

export function sanitizeBlackBoxEvent(event: BlackBoxEvent): BlackBoxEvent {
  return {
    ...event,
    approximateLat:
      typeof event.approximateLat === "number"
        ? Math.round(event.approximateLat * 100) / 100
        : undefined,
    approximateLng:
      typeof event.approximateLng === "number"
        ? Math.round(event.approximateLng * 100) / 100
        : undefined,
  };
}

export function shouldUploadBlackBox(
  event: BlackBoxEvent,
  settings: SensorSafetySettings
) {
  return settings.allowBlackBox && event.userConsent && !event.localOnly;
}
