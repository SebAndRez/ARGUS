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
      ...body,
      scenarioId,
      accessLevel: "institutional",
      mode: "institutional",
    });

    return NextResponse.json({
      actionPlan: result.actionPlan,
      institutionalActionPlan: result.institutionalActionPlan,
      routeSource: {
        sourceType: result.routeImpacts[0]?.metadata.sourceType ?? "DEMO",
        officialStatus: result.routeImpacts[0]?.metadata.officialStatus ?? "DEMO_ONLY",
        isDemo: true,
        disclaimer: result.disclaimers[1],
      },
    });
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }
}
