import { NextRequest, NextResponse } from "next/server";
import {
  createSafetyCheck,
  getSafetyChecks,
  respondToSafetyCheck,
} from "@/lib/mobile-safety/mobileSafetyService";
import { rejectOversizedPayload } from "@/lib/security/payloadSizeGuard";
import { enforceRateLimit, rateLimitResponseForOutcome } from "@/lib/security/rateLimit";
import type { SafetyCheckResponse } from "@/types/mobileSafety";

export const dynamic = "force-dynamic";

const MAX_SIGNAL_PAYLOAD_BYTES = 32 * 1024;

const validResponses: SafetyCheckResponse[] = [
  "I_AM_SAFE",
  "NEED_HELP",
  "INJURED",
  "TRAPPED",
  "CANNOT_MOVE",
  "WITH_OTHERS",
  "FALSE_ALARM",
];

export async function GET() {
  const checks = getSafetyChecks();
  return NextResponse.json({
    source: "mobile_safety_demo",
    count: checks.length,
    checks,
  });
}

export async function POST(request: NextRequest) {
  const oversized = rejectOversizedPayload(request, MAX_SIGNAL_PAYLOAD_BYTES);
  if (oversized) return oversized;

  const rateLimitOutcome = await enforceRateLimit({ policy: "mobile_safety_signal", request });
  const rateLimitedResponse = rateLimitResponseForOutcome(rateLimitOutcome);
  if (rateLimitedResponse) return rateLimitedResponse;

  const body = await request.json().catch(() => ({}));
  const check = createSafetyCheck({
    triggerEventId: body.triggerEventId,
    lastApproxLat:
      typeof body.latitude === "number" ? Number(body.latitude) : undefined,
    lastApproxLng:
      typeof body.longitude === "number" ? Number(body.longitude) : undefined,
    lastAccuracyBand: body.accuracyBand ?? "district",
    notes: body.notes ?? "Safety check demo creado manualmente.",
  });

  return NextResponse.json({ created: true, check });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  const response = body.response as SafetyCheckResponse;

  if (!id || !validResponses.includes(response)) {
    return NextResponse.json(
      { error: "id y response validos son requeridos." },
      { status: 400 }
    );
  }

  const check = respondToSafetyCheck(id, response);
  if (!check) {
    return NextResponse.json({ error: "Safety check no encontrado." }, { status: 404 });
  }

  return NextResponse.json({ updated: true, check });
}
