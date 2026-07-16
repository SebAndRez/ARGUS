import { NextRequest, NextResponse } from "next/server";
import {
  createSensorSafetyDetection,
  getSensorSafetyDetections,
} from "@/lib/sensor-safety/sensorSafetyStore";
import { rejectOversizedPayload } from "@/lib/security/payloadSizeGuard";
import { enforceRateLimit, rateLimitResponseForOutcome } from "@/lib/security/rateLimit";
import type { SensorSafetyDetectionStatus, SensorSafetyDetectionType, SensorSafetyModule } from "@/types/sensorSafety";

export const dynamic = "force-dynamic";

const MAX_SIGNAL_PAYLOAD_BYTES = 32 * 1024;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const moduleFilter = params.get("module") as SensorSafetyModule | null;
  const typeFilter = params.get("type") as SensorSafetyDetectionType | null;
  const statusFilter = params.get("status") as SensorSafetyDetectionStatus | null;
  const limit = Math.min(50, Math.max(1, Number(params.get("limit") ?? 20)));
  let detections = getSensorSafetyDetections();
  if (moduleFilter) detections = detections.filter((item) => item.module === moduleFilter);
  if (typeFilter) detections = detections.filter((item) => item.type === typeFilter);
  if (statusFilter) detections = detections.filter((item) => item.status === statusFilter);
  return NextResponse.json({ count: detections.slice(0, limit).length, detections: detections.slice(0, limit) });
}

export async function POST(request: NextRequest) {
  const oversized = rejectOversizedPayload(request, MAX_SIGNAL_PAYLOAD_BYTES);
  if (oversized) return oversized;

  const rateLimitOutcome = await enforceRateLimit({ policy: "sensor_safety_signal", request });
  const rateLimitedResponse = rateLimitResponseForOutcome(rateLimitOutcome);
  if (rateLimitedResponse) return rateLimitedResponse;

  const body = await request.json().catch(() => ({}));
  const { detection, checkIn } = createSensorSafetyDetection({
    module: body.module,
    type: body.type,
    confidence: typeof body.confidence === "number" ? body.confidence : undefined,
    approximateLat: typeof body.latitude === "number" ? body.latitude : undefined,
    approximateLng: typeof body.longitude === "number" ? body.longitude : undefined,
    isDemo: body.isDemo !== false,
  });
  return NextResponse.json({
    accepted: true,
    detectionId: detection.id,
    checkInRequired: true,
    checkInId: checkIn.id,
    timeoutSeconds: 90,
    message:
      "Deteccion preliminar recibida. No reemplaza servicios de emergencia ni fuentes oficiales.",
    detection,
    checkIn,
  });
}
