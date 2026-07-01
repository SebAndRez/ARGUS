import { NextRequest, NextResponse } from "next/server";
import { createDemoSensorSafetyScenario } from "@/lib/sensor-safety/sensorSafetyStore";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const scenario = typeof body.scenario === "string" ? body.scenario : "road_crash";
  return NextResponse.json({
    scenario,
    ...createDemoSensorSafetyScenario(scenario),
    mode: "demo_runtime",
  });
}
