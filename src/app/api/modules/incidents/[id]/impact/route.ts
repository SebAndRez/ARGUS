import { NextRequest, NextResponse } from "next/server";
import { requireOperator } from "@/lib/security/apiGuards";
import { enforceRateLimit, rateLimitResponseForOutcome } from "@/lib/security/rateLimit";
import { getModuleIncidentDetailContext } from "@/lib/modules/moduleOperationalContext";
import { buildIncidentImpactAssessment } from "@/lib/impact/incidentImpactAssessment";
import type { OperationalContextModuleId } from "@/types/moduleOperationalContext";

export const dynamic = "force-dynamic";

const VALID_MODULE_IDS: OperationalContextModuleId[] = ["argus-atlas", "argus-vigia", "argus-oraculo", "argus-talos"];

/**
 * Análisis de impacto geoespacial de un incidente canónico (Prompt 6).
 * Deliberadamente NO otra API cartográfica paralela: reutiliza exactamente
 * la misma identidad de incidente (`module` + `id`) que
 * `GET /api/modules/incidents/[id]` (Prompt 17) — este endpoint solo agrega
 * un cálculo derivado sobre el mismo incidente, nunca resuelve un incidente
 * por su cuenta.
 *
 * Gateado a OPERATOR+ además del control de acceso por módulo que
 * `getModuleIncidentDetailContext` ya aplica (dos capas del mismo sistema de
 * RBAC existente, no uno nuevo) — la infraestructura crítica cercana a un
 * incidente es un dato más sensible operacionalmente que el resumen del
 * incidente en sí, así que no hereda automáticamente el nivel de acceso más
 * amplio del endpoint base. Ver §35 del mandato: un DTO/nivel público
 * separado queda como deuda explícita (no construido en este pase).
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { user, response: authResponse } = await requireOperator();
  if (authResponse || !user) {
    return authResponse ?? NextResponse.json({ error: "Autenticación requerida." }, { status: 401 });
  }

  const rateLimitOutcome = await enforceRateLimit({
    policy: "incident_impact_read",
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
    const assessment = await buildIncidentImpactAssessment(incidentContext.data);
    return NextResponse.json(assessment);
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
