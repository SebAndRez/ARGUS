import { NextRequest, NextResponse } from "next/server";
import { escalateSensorSafetyCheck } from "@/lib/sensor-safety/sensorSafetyStore";
import { rejectOversizedPayload } from "@/lib/security/payloadSizeGuard";
import { enforceRateLimit, rateLimitResponseForOutcome } from "@/lib/security/rateLimit";

export const dynamic = "force-dynamic";

const MAX_SIGNAL_PAYLOAD_BYTES = 32 * 1024;

export async function POST(request: NextRequest) {
  const oversized = rejectOversizedPayload(request, MAX_SIGNAL_PAYLOAD_BYTES);
  if (oversized) return oversized;

  const rateLimitOutcome = await enforceRateLimit({ policy: "sensor_safety_signal", request });
  const rateLimitedResponse = rateLimitResponseForOutcome(rateLimitOutcome);
  if (rateLimitedResponse) return rateLimitedResponse;

  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id requerido." }, { status: 400 });
  const result = escalateSensorSafetyCheck(id);
  if (!result) {
    return NextResponse.json({ error: "Check-in no encontrado." }, { status: 404 });
  }
  return NextResponse.json({
    ...result,
    notice:
      "Escalacion demo: no envia contactos reales ni servicios de emergencia.",
  });
}
