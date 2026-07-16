import { NextRequest, NextResponse } from "next/server";
import { escalateSafetyCheck } from "@/lib/mobile-safety/mobileSafetyService";
import { rejectOversizedPayload } from "@/lib/security/payloadSizeGuard";
import { enforceRateLimit, rateLimitResponseForOutcome } from "@/lib/security/rateLimit";

export const dynamic = "force-dynamic";

const MAX_SIGNAL_PAYLOAD_BYTES = 32 * 1024;

export async function POST(request: NextRequest) {
  const oversized = rejectOversizedPayload(request, MAX_SIGNAL_PAYLOAD_BYTES);
  if (oversized) return oversized;

  const rateLimitOutcome = await enforceRateLimit({ policy: "mobile_safety_signal", request });
  const rateLimitedResponse = rateLimitResponseForOutcome(rateLimitOutcome);
  if (rateLimitedResponse) return rateLimitedResponse;

  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";

  if (!id) {
    return NextResponse.json({ error: "id requerido." }, { status: 400 });
  }

  const check = escalateSafetyCheck(id, body.reason);
  if (!check) {
    return NextResponse.json({ error: "Safety check no encontrado." }, { status: 404 });
  }

  return NextResponse.json({
    escalated: true,
    check,
    notice:
      "Escalamiento demo. No envia contactos reales ni activa servicios de emergencia.",
  });
}
