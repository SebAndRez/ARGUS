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
      lat?: number;
      lng?: number;
      radiusKm?: number;
      growthDirection?: FenixSimulationInput["growth"]["direction"];
      growthSpeedKmh?: number;
      simulationHorizonMinutes?: FenixSimulationInput["simulationMinutes"];
      mobilityMode?: FenixSimulationInput["mobility"];
      viewMode?: FenixSimulationInput["mode"];
      severity?: FenixSimulationInput["initialSeverity"];
      includeCitizenReports?: boolean;
      includeConnectedUsers?: boolean;
      includeRoutes?: boolean;
      includeShelters?: boolean;
      includeMedicalPoints?: boolean;
    };
    const scenarioId =
      typeof body.scenarioId === "string"
        ? body.scenarioId
        : "fenix-wildfire-urban-edge";
    const initialRadiusKm = Number(body.initialRadiusKm ?? body.radiusKm ?? 5);
    const simulationMinutes = Number(body.simulationMinutes ?? body.simulationHorizonMinutes ?? 60);
    const speedKmh = Number(body.growth?.speedKmh ?? body.growthSpeedKmh ?? 2.5);

    if (!Number.isFinite(initialRadiusKm) || initialRadiusKm <= 0) {
      return NextResponse.json({ error: "Radio inicial inválido." }, { status: 400 });
    }
    if (!Number.isFinite(simulationMinutes) || simulationMinutes <= 0) {
      return NextResponse.json({ error: "Tiempo de simulación inválido." }, { status: 400 });
    }
    if (!Number.isFinite(speedKmh) || speedKmh < 0) {
      return NextResponse.json({ error: "Velocidad de crecimiento inválida." }, { status: 400 });
    }

    const { vehicleType, accessLevel } = body;
    void vehicleType;
    void accessLevel;

    const result = runFenixSimulation({
      scenarioId,
      initialLocation: body.initialLocation ?? {
        latitude: Number(body.lat ?? -33.45),
        longitude: Number(body.lng ?? -70.66),
      },
      crisisType: body.crisisType,
      exposedPopulationEstimate: body.exposedPopulationEstimate,
      uncertainty: body.uncertainty,
      initialRadiusKm,
      simulationMinutes: simulationMinutes as FenixSimulationInput["simulationMinutes"],
      growth: {
        direction: body.growth?.direction ?? body.growthDirection ?? "NE",
        speedKmh,
      },
      mobility: body.mobility ?? body.mobilityMode,
      mode: body.mode ?? body.viewMode,
      initialSeverity: body.initialSeverity ?? body.severity,
      sources: {
        citizenReports: body.includeCitizenReports ?? body.sources?.citizenReports ?? true,
        connectedUsersAggregate: body.includeConnectedUsers ?? body.sources?.connectedUsersAggregate ?? true,
        officialOrOpenRoutes: body.includeRoutes ?? body.sources?.officialOrOpenRoutes ?? true,
        shelters: body.includeShelters ?? body.sources?.shelters ?? true,
        medicalPoints: body.includeMedicalPoints ?? body.sources?.medicalPoints ?? true,
        existingIncidents: body.sources?.existingIncidents ?? true,
        weather: body.sources?.weather ?? true,
      },
    });

    return NextResponse.json({
      simulationId: result.simulationId,
      geoContext: result.geoContext,
      nearbySettlements: result.nearbySettlements,
      input: result.input,
      affectedZones: result.affectedZones,
      predictionFrames: result.predictionFrames,
      routeImpacts: result.routeImpacts,
      nearbyReportsAggregate: result.reportDensity,
      connectedUsersAggregate: result.connectedUsersAggregate,
      reportDensity: result.reportDensity,
      shelters: result.shelters,
      medicalPoints: result.medicalPoints,
      riskBreakdown: result.riskBreakdown,
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
