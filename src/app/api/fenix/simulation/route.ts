import { NextRequest, NextResponse } from "next/server";
import { runFenixSimulation } from "@/lib/fenix/fenixSimulationEngine";
import type {
  FenixInstitutionalAccessLevel,
  FenixVehicleType,
} from "@/types/fenix";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const scenarioId =
      typeof body.scenarioId === "string"
        ? body.scenarioId
        : "fenix-wildfire-urban-edge";

    return NextResponse.json({
      result: runFenixSimulation({
        scenarioId,
        vehicleType: (body.vehicleType as FenixVehicleType) ?? "car",
        accessLevel:
          (body.accessLevel as FenixInstitutionalAccessLevel) ?? "public",
      }),
    });
  } catch {
    return NextResponse.json({ error: "Payload invalido." }, { status: 400 });
  }
}
