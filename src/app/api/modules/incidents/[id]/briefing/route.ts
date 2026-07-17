import { NextRequest, NextResponse } from "next/server";
import { requireOperator } from "@/lib/security/apiGuards";
import { enforceRateLimit, rateLimitResponseForOutcome } from "@/lib/security/rateLimit";
import { getModuleIncidentDetailContext } from "@/lib/modules/moduleOperationalContext";
import { buildOperationalBriefing } from "@/lib/briefing/operationalBriefing";
import type { OperationalContextModuleId } from "@/types/moduleOperationalContext";

export const dynamic = "force-dynamic";

const VALID_MODULE_IDS: OperationalContextModuleId[] = ["argus-atlas", "argus-vigia", "argus-oraculo", "argus-talos"];

/**
 * Síntesis operacional / briefing de un incidente canónico (Prompt 8). Misma
 * identidad de incidente (`module` + `id`) que los endpoints de detalle,
 * impacto y expediente territorial ya existentes — ninguna API paralela.
 *
 * Sin capacidad de "regenerar": en este pase el briefing se calcula bajo
 * demanda en cada solicitud (sin persistencia, ver deuda técnica), por lo
 * que `GET` y una eventual "regeneración" son la misma operación — no se
 * agregó un segundo endpoint `POST` que haría exactamente lo mismo.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { user, response: authResponse } = await requireOperator();
  if (authResponse || !user) {
    return authResponse ?? NextResponse.json({ error: "Autenticación requerida." }, { status: 401 });
  }

  const rateLimitOutcome = await enforceRateLimit({
    policy: "operational_briefing_read",
    request,
    identity: { userId: user.id },
  });
  const rateLimitedResponse = rateLimitResponseForOutcome(rateLimitOutcome);
  if (rateLimitedResponse) return rateLimitedResponse;

  const { id } = await context.params;
  const moduleId = request.nextUrl.searchParams.get("module") as OperationalContextModuleId | null;
  if (!moduleId || !VALID_MODULE_IDS.includes(moduleId)) {
    return NextResponse.json(
      { error: "Parámetro ?module= requerido y debe ser uno de los cuatro módulos soportados." },
      { status: 400 }
    );
  }

  const incidentContext = await getModuleIncidentDetailContext(moduleId, id);
  if (incidentContext.state === "available" || incidentContext.state === "degraded") {
    const result = await buildOperationalBriefing(incidentContext.data);
    return NextResponse.json(result);
  }
  if (incidentContext.state === "empty") {
    return NextResponse.json({ error: "Incidente no encontrado." }, { status: 404 });
  }
  if (incidentContext.state === "unauthorized") {
    return NextResponse.json({ error: incidentContext.error.message }, { status: incidentContext.error.code === "FORBIDDEN" ? 403 : 401 });
  }
  const status = incidentContext.error.code === "INCIDENT_NOT_FOUND" ? 404 : incidentContext.error.code === "INVALID_INCIDENT_ID" ? 400 : 502;
  return NextResponse.json({ error: incidentContext.error.message }, { status });
}
