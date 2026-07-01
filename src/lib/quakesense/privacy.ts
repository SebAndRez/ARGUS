import type { QuakeSenseCitizenSignal } from "@/types/quakesense";

export function createEphemeralQuakeSenseSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `qs-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function hashSessionId(sessionId: string) {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const encoded = new TextEncoder().encode(sessionId);
    const digest = await crypto.subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 32);
  }
  return `hash-${sessionId.slice(0, 12)}`;
}

export function roundLocation(lat?: number, lng?: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {};
  }
  return {
    latRounded: Math.round(Number(lat) * 100) / 100,
    lngRounded: Math.round(Number(lng) * 100) / 100,
  };
}

export function getAccuracyBand(accuracyMeters?: number) {
  if (!Number.isFinite(accuracyMeters)) return "unknown" as const;
  if (Number(accuracyMeters) > 10000) return "city" as const;
  if (Number(accuracyMeters) > 2000) return "district" as const;
  return "coarse" as const;
}

export function sanitizeQuakeSenseSignal(
  signal: QuakeSenseCitizenSignal
): QuakeSenseCitizenSignal {
  return {
    id: signal.id,
    sessionIdHash: signal.sessionIdHash.slice(0, 64),
    detectedAt: signal.detectedAt,
    latRounded:
      typeof signal.latRounded === "number"
        ? Math.round(signal.latRounded * 100) / 100
        : undefined,
    lngRounded:
      typeof signal.lngRounded === "number"
        ? Math.round(signal.lngRounded * 100) / 100
        : undefined,
    geohashApprox: signal.geohashApprox?.slice(0, 8),
    accuracyBand: signal.accuracyBand,
    peakAcceleration: Math.min(80, Math.max(0, Number(signal.peakAcceleration))),
    confidence: Math.min(100, Math.max(0, Number(signal.confidence))),
    userConsent: Boolean(signal.userConsent),
    source: "citizen_sensor",
    isDemo: Boolean(signal.isDemo),
  };
}
