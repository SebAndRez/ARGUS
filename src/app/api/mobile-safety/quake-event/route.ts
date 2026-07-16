import { NextRequest, NextResponse } from "next/server";
import {
  createMobileQuakeEvent,
  createSafetyCheck,
  getMobileSafetySettings,
} from "@/lib/mobile-safety/mobileSafetyService";
import { rejectOversizedPayload } from "@/lib/security/payloadSizeGuard";
import { enforceRateLimit, rateLimitResponseForOutcome } from "@/lib/security/rateLimit";

export const dynamic = "force-dynamic";

const MAX_SIGNAL_PAYLOAD_BYTES = 32 * 1024; // 32 KB — small telemetry payload, no free text expected.

export async function POST(request: NextRequest) {
  const oversized = rejectOversizedPayload(request, MAX_SIGNAL_PAYLOAD_BYTES);
  if (oversized) return oversized;

  const rateLimitOutcome = await enforceRateLimit({ policy: "mobile_safety_signal", request });
  const rateLimitedResponse = rateLimitResponseForOutcome(rateLimitOutcome);
  if (rateLimitedResponse) return rateLimitedResponse;

  const body = await request.json().catch(() => ({}));
  const settings = getMobileSafetySettings();

  if (!settings.enabled) {
    return NextResponse.json(
      {
        accepted: false,
        reason: "Mobile Safety Agent desactivado por configuracion demo.",
      },
      { status: 409 }
    );
  }

  const event = createMobileQuakeEvent({
    platform: "WEB_PWA",
    appState: body.appState ?? "OPEN",
    peakAcceleration:
      typeof body.peakAcceleration === "number" ? body.peakAcceleration : 12.5,
    confidence: typeof body.confidence === "number" ? body.confidence : 68,
    approximateLat:
      typeof body.latitude === "number" ? Number(body.latitude) : undefined,
    approximateLng:
      typeof body.longitude === "number" ? Number(body.longitude) : undefined,
    accuracyBand: body.accuracyBand ?? "district",
    networkStatus: body.networkStatus ?? "online",
    batteryLevel:
      typeof body.batteryLevel === "number" ? body.batteryLevel : undefined,
    localOnly: false,
    sentToServer: true,
    isDemo: true,
  });

  const check = createSafetyCheck({
    triggerEventId: event.id,
    timeoutSeconds: settings.checkInTimeoutSeconds,
    lastApproxLat: event.approximateLat,
    lastApproxLng: event.approximateLng,
    lastAccuracyBand: event.accuracyBand,
    batteryLevel: event.batteryLevel,
    networkStatus: event.networkStatus,
    notes:
      "Check-in demo generado por posible sacudida detectada. Pendiente de respuesta del usuario.",
  });

  return NextResponse.json({
    accepted: true,
    event,
    check,
    notice:
      "Evento experimental. No confirma terremoto ni reemplaza fuentes oficiales.",
  });
}
