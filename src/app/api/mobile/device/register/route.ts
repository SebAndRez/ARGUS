import { NextResponse } from "next/server";
import { rejectOversizedPayload } from "@/lib/security/payloadSizeGuard";
import { enforceRateLimit, rateLimitResponseForOutcome } from "@/lib/security/rateLimit";
import type { MobileDeviceRegistration, MobilePlatform } from "@/types/mobileApiContracts";

const platforms = new Set<MobilePlatform>(["ANDROID", "IOS", "WEB_PWA", "UNKNOWN"]);
const MAX_SIGNAL_PAYLOAD_BYTES = 32 * 1024;

function clean(value: unknown, max = 120) {
  return String(value ?? "").replace(/[<>]/g, "").trim().slice(0, max);
}

export async function POST(request: Request) {
  const oversized = rejectOversizedPayload(request, MAX_SIGNAL_PAYLOAD_BYTES);
  if (oversized) return oversized;

  const rateLimitOutcome = await enforceRateLimit({ policy: "mobile_safety_signal", request });
  const rateLimitedResponse = rateLimitResponseForOutcome(rateLimitOutcome);
  if (rateLimitedResponse) return rateLimitedResponse;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const deviceIdHash = clean(body.deviceIdHash);
  const platform = platforms.has(body.platform as MobilePlatform)
    ? (body.platform as MobilePlatform)
    : "UNKNOWN";
  const appVersion = clean(body.appVersion, 40);
  const capabilities = Array.isArray(body.capabilities)
    ? body.capabilities.map((item) => clean(item, 60)).slice(0, 20)
    : [];

  if (!deviceIdHash || !appVersion) {
    return NextResponse.json({ accepted: false, error: "deviceIdHash y appVersion requeridos." }, { status: 400 });
  }

  const registration: MobileDeviceRegistration = {
    deviceIdHash,
    userId: clean(body.userId) || undefined,
    platform,
    appVersion,
    pushTokenHash: clean(body.pushTokenHash) || undefined,
    capabilities: capabilities as MobileDeviceRegistration["capabilities"],
    createdAt: new Date().toISOString(),
  };

  return NextResponse.json({
    accepted: true,
    mode: "runtime_placeholder",
    message: "Dispositivo recibido. Persistencia segura pendiente de modelo mobile/RLS.",
    registration,
  });
}
