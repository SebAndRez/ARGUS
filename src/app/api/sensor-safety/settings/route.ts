import { NextRequest, NextResponse } from "next/server";
import {
  getSensorSafetySettings,
  updateSensorSafetySettings,
} from "@/lib/sensor-safety/sensorSafetyStore";
import type { SensorSafetyModule, SensorSafetySettings } from "@/types/sensorSafety";

export const dynamic = "force-dynamic";

const validModules: SensorSafetyModule[] = [
  "QUAKESENSE",
  "ROADSENSE",
  "FALLSENSE",
  "ROUTE_GUARDIAN",
  "DEAD_MAN_SWITCH",
  "BLACK_BOX",
  "SAFETY_CHECK",
];

export async function GET() {
  return NextResponse.json({
    settings: getSensorSafetySettings(),
    mode: "demo_runtime",
  });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const enabledModules = Array.isArray(body.enabledModules)
    ? body.enabledModules.filter((item: unknown): item is SensorSafetyModule =>
        validModules.includes(item as SensorSafetyModule)
      )
    : undefined;
  const patch: Partial<SensorSafetySettings> = {
    enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
    enabledModules,
    allowBackgroundSensor:
      typeof body.allowBackgroundSensor === "boolean"
        ? body.allowBackgroundSensor
        : undefined,
    allowApproxLocationOnEmergency:
      typeof body.allowApproxLocationOnEmergency === "boolean"
        ? body.allowApproxLocationOnEmergency
        : undefined,
    allowCommandCenterEscalation:
      typeof body.allowCommandCenterEscalation === "boolean"
        ? body.allowCommandCenterEscalation
        : undefined,
    checkInTimeoutSeconds:
      typeof body.checkInTimeoutSeconds === "number"
        ? Math.min(600, Math.max(30, body.checkInTimeoutSeconds))
        : undefined,
  };
  return NextResponse.json({
    settings: updateSensorSafetySettings(
      Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== undefined)
      ) as Partial<SensorSafetySettings>
    ),
  });
}
