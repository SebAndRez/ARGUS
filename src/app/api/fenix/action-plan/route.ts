import { NextRequest, NextResponse } from "next/server";
import { runFenixSimulation } from "@/lib/fenix/fenixSimulationEngine";
import { requireOperator } from "@/lib/security/apiGuards";

export const dynamic = "force-dynamic";

/**
 * Reuses `requireOperator()` (src/lib/security/apiGuards.ts) instead of a
 * second, locally-duplicated `INSTITUTIONAL_ROLES` set — see docs/modules/
 * ARGUS_FENIX_CANONICALIZATION.md. Same allowed roles as before
 * (OPERATOR/ANALYST/ADMIN/SUPER_ADMIN); `INSTITUTIONAL_ADMIN` was never
 * reachable from a real session anyway (see docs/security/
 * ARGUS_MODULE_ACCESS_BASELINE.md).
 */
export async function POST(request: NextRequest) {
  const { user, response: authResponse } = await requireOperator();
  if (authResponse || !user) return authResponse ?? NextResponse.json({ error: "Autenticacion requerida." }, { status: 401 });

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
