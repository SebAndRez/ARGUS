import { NextRequest, NextResponse } from "next/server";
import { runFenixSimulation } from "@/lib/fenix/fenixSimulationEngine";
import type { FenixSimulationInput } from "@/types/fenixSimulation";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<FenixSimulationInput> & {
      scenarioId?: string;
      vehicleType?: string;
      accessLevel?: string;
    };
    const scenarioId =
      typeof body.scenarioId === "string"
        ? body.scenarioId
        : "fenix-wildfire-urban-edge";
    const initialRadiusKm = Number(body.initialRadiusKm ?? 5);
    const simulationMinutes = Number(body.simulationMinutes ?? 60);
    const speedKmh = Number(body.growth?.speedKmh ?? 2.5);

    if (!Number.isFinite(initialRadiusKm) || initialRadiusKm <= 0) {
      return NextResponse.json({ error: "Radio inicial inválido." }, { status: 400 });
    }
    if (!Number.isFinite(simulationMinutes) || simulationMinutes <= 0) {
      return NextResponse.json({ error: "Tiempo de simulación inválido." }, { status: 400 });
    }
    if (!Number.isFinite(speedKmh) || speedKmh < 0) {
      return NextResponse.json({ error: "Velocidad de crecimiento inválida." }, { status: 400 });
    }

    const { vehicleType, accessLevel, ...simulationBody } = body;
    void vehicleType;
    void accessLevel;

    const result = runFenixSimulation({
      ...simulationBody,
      scenarioId,
      initialRadiusKm,
      simulationMinutes: simulationMinutes as FenixSimulationInput["simulationMinutes"],
      growth: {
        direction: body.growth?.direction ?? "NE",
        speedKmh,
      },
    });

    return NextResponse.json({
      simulationId: result.simulationId,
      input: result.input,
      affectedZones: result.affectedZones,
      routeImpacts: result.routeImpacts,
      connectedUsersAggregate: result.connectedUsersAggregate,
      reportDensity: result.reportDensity,
      shelters: result.shelters,
      medicalPoints: result.medicalPoints,
      confidence: result.confidence,
      uncertainty: result.uncertainty,
      publicGuidance: result.publicGuidance,
      institutionalActionPlan: result.institutionalActionPlan,
      disclaimers: result.disclaimers,
      isDemo: result.isDemo,
      result,
    });
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }
}

export async function GET() {
  const result = runFenixSimulation({ scenarioId: "fenix-wildfire-urban-edge" });
  return NextResponse.json({
    source: "demo",
    count: 1,
    simulations: [result],
  });
}
