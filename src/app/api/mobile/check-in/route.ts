import { NextResponse } from "next/server";
import { respondToSensorSafetyCheck } from "@/lib/sensor-safety/sensorSafetyStore";
import type { MobileSafetyCheckPayload } from "@/types/mobileApiContracts";
import type { SensorSafetyResponse } from "@/types/sensorSafety";
import { enforceRateLimit, rateLimitResponseForOutcome } from "@/lib/security/rateLimit";

export async function PATCH(request: Request) {
  // Same policy as PATCH /api/sensor-safety/check-ins, which mutates the same store.
  const rateLimitOutcome = await enforceRateLimit({ policy: "sensor_safety_signal", request });
  const rateLimitedResponse = rateLimitResponseForOutcome(rateLimitOutcome);
  if (rateLimitedResponse) return rateLimitedResponse;

  const payload = (await request.json().catch(() => ({}))) as Partial<MobileSafetyCheckPayload>;
  if (!payload.checkInId || !payload.response) {
    return NextResponse.json({ updated: false, error: "checkInId y response requeridos." }, { status: 400 });
  }

  const checkIn = respondToSensorSafetyCheck(payload.checkInId, payload.response as SensorSafetyResponse);
  if (!checkIn) {
    return NextResponse.json({ updated: false, error: "Check-in no encontrado." }, { status: 404 });
  }

  return NextResponse.json({
    updated: true,
    checkIn,
    message: "Respuesta mobile recibida. No se contacto a servicios de emergencia.",
  });
}
