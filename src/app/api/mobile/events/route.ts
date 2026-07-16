import { NextResponse } from "next/server";
import { createSensorSafetyDetection } from "@/lib/sensor-safety/sensorSafetyStore";
import { rejectOversizedPayload } from "@/lib/security/payloadSizeGuard";
import { enforceRateLimit, rateLimitResponseForOutcome } from "@/lib/security/rateLimit";
import type { MobileEventPayload } from "@/types/mobileApiContracts";
import type { SensorSafetyDetectionType, SensorSafetyModule } from "@/types/sensorSafety";

const MAX_SIGNAL_PAYLOAD_BYTES = 32 * 1024;

const moduleMap: Record<string, SensorSafetyModule> = {
  QUAKESENSE: "QUAKESENSE",
  ROADSENSE: "ROADSENSE",
  FALLSENSE: "FALLSENSE",
  ROUTE_GUARDIAN: "ROUTE_GUARDIAN",
  DEAD_MAN_SWITCH: "DEAD_MAN_SWITCH",
  SAFETY_CHECK: "SAFETY_CHECK",
  AURA: "SAFETY_CHECK",
};

const typeMap: Record<string, SensorSafetyDetectionType> = {
  POSSIBLE_QUAKE: "EARTHQUAKE_SHAKE",
  POSSIBLE_CRASH: "VEHICLE_CRASH",
  POSSIBLE_ROLLOVER: "VEHICLE_ROLLOVER",
  HARD_BRAKE: "HARD_BRAKE",
  POSSIBLE_FALL: "HARD_FALL",
  NO_RESPONSE: "NO_RESPONSE",
  ROUTE_STOP: "ROUTE_STOP_ANOMALY",
};

export async function POST(request: Request) {
  const oversized = rejectOversizedPayload(request, MAX_SIGNAL_PAYLOAD_BYTES);
  if (oversized) return oversized;

  const rateLimitOutcome = await enforceRateLimit({ policy: "mobile_safety_signal", request });
  const rateLimitedResponse = rateLimitResponseForOutcome(rateLimitOutcome);
  if (rateLimitedResponse) return rateLimitedResponse;

  const payload = (await request.json().catch(() => ({}))) as Partial<MobileEventPayload>;
  if (!payload.deviceIdHash || !payload.eventType || !payload.module || !payload.consentVersion) {
    return NextResponse.json({ accepted: false, error: "Payload mobile incompleto." }, { status: 400 });
  }

  const { detection, checkIn } = createSensorSafetyDetection({
    userId: payload.userId,
    deviceSessionIdHash: payload.deviceIdHash,
    module: moduleMap[payload.module] ?? "SAFETY_CHECK",
    type: typeMap[payload.eventType] ?? "DEMO",
    confidence: payload.confidence,
    severity: payload.severity,
    appState: payload.appState,
    platform: "ANDROID_NATIVE",
    approximateLat: payload.location?.latitude,
    approximateLng: payload.location?.longitude,
    accuracyBand: payload.location?.accuracyBand,
    isDemo: payload.isDemo !== false,
    argusSummary:
      "Evento movil preliminar recibido. No confirma emergencia sin check-in, fuente oficial o revision humana.",
  });

  return NextResponse.json({
    accepted: true,
    mode: "runtime_placeholder",
    checkInRequired: true,
    detectionId: detection.id,
    checkInId: checkIn.id,
    message: "Evento movil recibido como evidencia preliminar. No se envio push real.",
  });
}
