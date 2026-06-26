import { NextRequest, NextResponse } from "next/server";
import { runFenixSimulation } from "@/lib/fenix/fenixSimulationEngine";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const scenarioId =
      typeof body.scenarioId === "string"
        ? body.scenarioId
        : "fenix-wildfire-urban-edge";
    const result = runFenixSimulation({
      scenarioId,
      accessLevel: "institutional",
    });

    return NextResponse.json({
      actionPlan: result.actionPlan,
    });
  } catch {
    return NextResponse.json({ error: "Payload invalido." }, { status: 400 });
  }
}
