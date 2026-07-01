import { NextRequest, NextResponse } from "next/server";
import {
  getMobileSafetySettings,
  updateMobileSafetySettings,
} from "@/lib/mobile-safety/mobileSafetyService";
import type { MobileSafetySettings } from "@/types/mobileSafety";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    source: "mobile_safety_demo",
    settings: getMobileSafetySettings(),
    limitations: [
      "Demo Web/PWA sin sensores nativos en segundo plano.",
      "No envia push real ni contacta emergencias.",
    ],
  });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const allowed = {
    enabled:
      typeof body.enabled === "boolean" ? Boolean(body.enabled) : undefined,
    allowBackgroundSensor:
      typeof body.allowBackgroundSensor === "boolean"
        ? Boolean(body.allowBackgroundSensor)
        : undefined,
    allowApproxLocationOnEmergency:
      typeof body.allowApproxLocationOnEmergency === "boolean"
        ? Boolean(body.allowApproxLocationOnEmergency)
        : undefined,
    allowEmergencyContacts:
      typeof body.allowEmergencyContacts === "boolean"
        ? Boolean(body.allowEmergencyContacts)
        : undefined,
    allowCommandCenterEscalation:
      typeof body.allowCommandCenterEscalation === "boolean"
        ? Boolean(body.allowCommandCenterEscalation)
        : undefined,
    allowMissingPersonCandidate:
      typeof body.allowMissingPersonCandidate === "boolean"
        ? Boolean(body.allowMissingPersonCandidate)
        : undefined,
    checkInTimeoutSeconds:
      typeof body.checkInTimeoutSeconds === "number"
        ? Math.min(600, Math.max(30, body.checkInTimeoutSeconds))
        : undefined,
    sensitivity:
      body.sensitivity === "low" ||
      body.sensitivity === "medium" ||
      body.sensitivity === "high"
        ? body.sensitivity
        : undefined,
  };

  return NextResponse.json({
    source: "mobile_safety_demo",
    settings: updateMobileSafetySettings(
      Object.fromEntries(
        Object.entries(allowed).filter(([, value]) => value !== undefined)
      ) as Partial<MobileSafetySettings>
    ),
  });
}

export const POST = PATCH;
