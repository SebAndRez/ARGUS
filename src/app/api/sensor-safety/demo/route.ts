import { NextRequest, NextResponse } from "next/server";
import { createDemoSensorSafetyScenario } from "@/lib/sensor-safety/sensorSafetyStore";
import { enforceRateLimit, rateLimitResponseForOutcome } from "@/lib/security/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rateLimitOutcome = await enforceRateLimit({ policy: "sensor_safety_signal", request });
  const rateLimitedResponse = rateLimitResponseForOutcome(rateLimitOutcome);
  if (rateLimitedResponse) return rateLimitedResponse;

  const body = await request.json().catch(() => ({}));
  const scenario = typeof body.scenario === "string" ? body.scenario : "road_crash";
  return NextResponse.json({
    scenario,
    ...createDemoSensorSafetyScenario(scenario),
    mode: "demo_runtime",
  });
}
