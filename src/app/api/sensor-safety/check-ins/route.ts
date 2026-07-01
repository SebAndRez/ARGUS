import { NextRequest, NextResponse } from "next/server";
import {
  createDemoSensorSafetyScenario,
  getSensorSafetyCheckIns,
  respondToSensorSafetyCheck,
} from "@/lib/sensor-safety/sensorSafetyStore";
import type { SensorSafetyResponse } from "@/types/sensorSafety";

export const dynamic = "force-dynamic";

export async function GET() {
  const checkIns = getSensorSafetyCheckIns();
  return NextResponse.json({ count: checkIns.length, checkIns });
}

export async function POST() {
  const { checkIn, detection } = createDemoSensorSafetyScenario("road_crash");
  return NextResponse.json({ created: true, detection, checkIn });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  const response = body.response as SensorSafetyResponse;
  if (!id || !response) {
    return NextResponse.json({ error: "id y response requeridos." }, { status: 400 });
  }
  const checkIn = respondToSensorSafetyCheck(id, response);
  if (!checkIn) {
    return NextResponse.json({ error: "Check-in no encontrado." }, { status: 404 });
  }
  return NextResponse.json({ updated: true, checkIn });
}
