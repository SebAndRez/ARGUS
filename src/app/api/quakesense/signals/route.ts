import { NextRequest, NextResponse } from "next/server";
import { addQuakeSenseSignal, getQuakeSenseClusters } from "@/lib/quakesense/quakesenseMemoryStore";
import { sanitizeQuakeSenseSignal } from "@/lib/quakesense/privacy";
import { rejectOversizedPayload } from "@/lib/security/payloadSizeGuard";
import { enforceRateLimit, rateLimitResponseForOutcome } from "@/lib/security/rateLimit";
import type { QuakeSenseCitizenSignal } from "@/types/quakesense";

export const dynamic = "force-dynamic";

const MAX_SIGNAL_PAYLOAD_BYTES = 32 * 1024;

export async function GET(request: NextRequest) {
  const limit = Math.min(50, Math.max(1, Number(request.nextUrl.searchParams.get("limit") ?? 10)));
  const clusters = getQuakeSenseClusters(true).slice(0, limit);

  return NextResponse.json({
    source: "quakesense_memory_demo",
    count: clusters.length,
    clusters,
  });
}

export async function POST(request: NextRequest) {
  const oversized = rejectOversizedPayload(request, MAX_SIGNAL_PAYLOAD_BYTES);
  if (oversized) return oversized;

  const rateLimitOutcome = await enforceRateLimit({ policy: "quakesense_signal", request });
  const rateLimitedResponse = rateLimitResponseForOutcome(rateLimitOutcome);
  if (rateLimitedResponse) return rateLimitedResponse;

  try {
    const body = (await request.json()) as Partial<QuakeSenseCitizenSignal>;
    const candidate: QuakeSenseCitizenSignal = {
      id: typeof body.id === "string" ? body.id.slice(0, 80) : `qs-signal-${Date.now()}`,
      sessionIdHash:
        typeof body.sessionIdHash === "string"
          ? body.sessionIdHash
          : "missing-session",
      detectedAt:
        typeof body.detectedAt === "string"
          ? body.detectedAt
          : new Date().toISOString(),
      latRounded: typeof body.latRounded === "number" ? body.latRounded : undefined,
      lngRounded: typeof body.lngRounded === "number" ? body.lngRounded : undefined,
      geohashApprox:
        typeof body.geohashApprox === "string" ? body.geohashApprox : undefined,
      accuracyBand: body.accuracyBand ?? "unknown",
      peakAcceleration: Number(body.peakAcceleration ?? 0),
      confidence: Number(body.confidence ?? 0),
      userConsent: Boolean(body.userConsent),
      source: "citizen_sensor",
      isDemo: Boolean(body.isDemo),
    };

    if (!candidate.userConsent) {
      return NextResponse.json(
        { accepted: false, message: "Consentimiento requerido." },
        { status: 400 }
      );
    }
    if (candidate.confidence < 25 || candidate.peakAcceleration <= 0) {
      return NextResponse.json(
        { accepted: false, message: "Senal insuficiente para registrar." },
        { status: 400 }
      );
    }

    const signal = addQuakeSenseSignal(sanitizeQuakeSenseSignal(candidate));
    const cluster = getQuakeSenseClusters(true)[0] ?? null;

    return NextResponse.json({
      accepted: true,
      signalId: signal.id,
      cluster,
      message:
        "Alerta preliminar recibida. Estimacion ARGUS, pendiente de confirmacion oficial.",
    });
  } catch {
    return NextResponse.json({ accepted: false, message: "Payload invalido." }, { status: 400 });
  }
}
