import { NextRequest, NextResponse } from "next/server";
import { runFenixSimulation } from "@/lib/fenix/fenixSimulationEngine";
import { createFenixSeedFromPrediction } from "@/lib/predictive-core/fenixBridge";
import { getCurrentUser } from "@/services/authService";
import type { ArgusDecisionPacket } from "@/types/predictiveCore";
import type { FenixSimulationInput } from "@/types/fenixSimulation";

export const dynamic = "force-dynamic";
const INSTITUTIONAL_ROLES = new Set([
  "OPERATOR",
  "ANALYST",
  "ADMIN",
  "SUPER_ADMIN",
  "INSTITUTIONAL_ADMIN",
]);

function mapPredictiveSeverity(value?: string | null): FenixSimulationInput["initialSeverity"] | undefined {
  if (!value) return undefined;
  if (value === "P0") return "critical";
  if (value === "P1") return "high";
  if (value === "P2") return "medium";
  if (value === "P3" || value === "P4") return "low";
  if (["low", "medium", "high", "critical"].includes(value)) {
    return value as FenixSimulationInput["initialSeverity"];
  }
  return undefined;
}

function mapPredictiveHazard(value?: string | null): FenixSimulationInput["crisisType"] | undefined {
  if (!value) return undefined;
  if (value === "sos" || value === "medical") return "mass_casualty";
  if (value === "fire") return "wildfire";
  if (value === "volcano") return "volcanic";
  if (value === "earthquake" || value === "tsunami" || value === "flood") {
    return value;
  }
  if (value === "conflict") return "conflict";
  return undefined;
}

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
      predictivePacket?: ArgusDecisionPacket;
    };
    const predictiveSeed = body.predictivePacket
      ? createFenixSeedFromPrediction(body.predictivePacket)
      : null;
    const scenarioId =
      typeof body.scenarioId === "string"
        ? body.scenarioId
        : "fenix-wildfire-urban-edge";
    const initialRadiusKm = Number(body.initialRadiusKm ?? body.radiusKm ?? 5);
    const simulationMinutes = Number(body.simulationMinutes ?? body.simulationHorizonMinutes ?? 60);
    const speedKmh = Number(body.growth?.speedKmh ?? body.growthSpeedKmh ?? 2.5);
    const requestedMode = body.mode ?? body.viewMode ?? "public";
    const user = await getCurrentUser();
    const canUseInstitutionalMode = Boolean(
      user && INSTITUTIONAL_ROLES.has(user.role)
    );

    if (requestedMode === "institutional" && !canUseInstitutionalMode) {
      return NextResponse.json(
        {
          error:
            "Modo institucional Fenix requiere rol operativo. Use modo publico para simulacion ciudadana.",
        },
        { status: 403 }
      );
    }

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
        latitude: Number(body.lat ?? predictiveSeed?.lat ?? -33.45),
        longitude: Number(body.lng ?? predictiveSeed?.lng ?? -70.66),
      },
      crisisType: body.crisisType ?? mapPredictiveHazard(predictiveSeed?.crisisType),
      exposedPopulationEstimate: body.exposedPopulationEstimate,
      uncertainty: body.uncertainty,
      initialRadiusKm,
      simulationMinutes: simulationMinutes as FenixSimulationInput["simulationMinutes"],
      growth: {
        direction: body.growth?.direction ?? body.growthDirection ?? "NE",
        speedKmh,
      },
      mobility: body.mobility ?? body.mobilityMode,
      mode: canUseInstitutionalMode ? requestedMode : "public",
      initialSeverity:
        body.initialSeverity ??
        body.severity ??
        mapPredictiveSeverity(predictiveSeed?.severity),
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
      mapCenter: result.mapCenter,
      initialRadiusKm: result.initialRadiusKm,
      projectedZonesGeoJson: result.projectedZonesGeoJson,
      sourcesUsed: result.sourcesUsed,
      dataQuality: result.dataQuality,
      confidence: result.confidence,
      uncertainty: result.uncertainty,
      publicGuidance: result.publicGuidance,
      institutionalActionPlan: result.institutionalActionPlan,
      disclaimers: result.disclaimers,
      predictiveSeed,
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
