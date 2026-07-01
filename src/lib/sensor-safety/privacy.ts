import { createHash, randomUUID } from "crypto";
import type { SensorSafetyCheckIn, SensorSafetyDetection } from "@/types/sensorSafety";

export function createEphemeralDeviceSessionId() {
  return randomUUID();
}

export function hashDeviceSessionId(sessionId: string) {
  return createHash("sha256").update(sessionId).digest("hex").slice(0, 32);
}

export function roundEmergencyLocation(lat?: number, lng?: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return {};
  return {
    approximateLat: Math.round(Number(lat) * 100) / 100,
    approximateLng: Math.round(Number(lng) * 100) / 100,
  };
}

export function getAccuracyBand(accuracyMeters?: number) {
  if (!Number.isFinite(accuracyMeters)) return "unknown" as const;
  if (Number(accuracyMeters) > 10000) return "city" as const;
  if (Number(accuracyMeters) > 2000) return "district" as const;
  return "coarse" as const;
}

export function sanitizeSensorSafetyDetection(
  detection: SensorSafetyDetection
): SensorSafetyDetection {
  return {
    ...detection,
    userId: undefined,
    approximateLat:
      typeof detection.approximateLat === "number"
        ? Math.round(detection.approximateLat * 100) / 100
        : undefined,
    approximateLng:
      typeof detection.approximateLng === "number"
        ? Math.round(detection.approximateLng * 100) / 100
        : undefined,
  };
}

export function sanitizePublicSafetyCheck(checkIn: SensorSafetyCheckIn) {
  return {
    id: checkIn.id,
    status: checkIn.status,
    isDemo: checkIn.isDemo,
    approximateLat: checkIn.approximateLat,
    approximateLng: checkIn.approximateLng,
    accuracyBand: checkIn.accuracyBand,
  };
}

export function sanitizeCommandSafetyCheck(checkIn: SensorSafetyCheckIn) {
  return checkIn;
}
