import { NextRequest, NextResponse } from "next/server";
import { runFenixSimulation } from "@/lib/fenix/fenixSimulationEngine";
import { getCurrentUser } from "@/services/authService";

export const dynamic = "force-dynamic";
const INSTITUTIONAL_ROLES = new Set([
  "OPERATOR",
  "ANALYST",
  "ADMIN",
  "SUPER_ADMIN",
  "INSTITUTIONAL_ADMIN",
]);

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !INSTITUTIONAL_ROLES.has(user.role)) {
      return NextResponse.json(
        {
          error:
            "Plan institucional Fenix requiere rol operativo. Use modo publico para resumen ciudadano.",
        },
        { status: 403 }
      );
    }
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
      planId: `fenix-plan-${Date.now()}`,
      summary: "Plan de apoyo ARGUS demo basado en simulacion estimada.",
      immediateActions: result.institutionalActionPlan.filter((item) => item.priority === "critical"),
      shortTermActions: result.institutionalActionPlan.filter((item) => item.priority === "high"),
      operationalActions: result.actionPlan.items,
      publicGuidance: result.publicGuidance,
      institutionalGuidance: result.institutionalActionPlan,
      routeReview: result.actionPlanResponse?.routeReview ?? [],
      shelterActions: result.shelters,
      medicalActions: result.medicalPoints,
      communicationActions: [
        "Preparar mensaje publico simple y validado por autoridad.",
        "Actualizar canales internos cada 30 minutos o ante cambio relevante.",
      ],
      limitations: result.disclaimers,
      confidence: result.confidence,
      disclaimers: result.disclaimers,
      isDemo: result.isDemo,
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
