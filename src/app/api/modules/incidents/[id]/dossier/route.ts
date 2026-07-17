import { NextRequest, NextResponse } from "next/server";
import { requireOperator } from "@/lib/security/apiGuards";
import { enforceRateLimit, rateLimitResponseForOutcome } from "@/lib/security/rateLimit";
import { getModuleIncidentDetailContext } from "@/lib/modules/moduleOperationalContext";
import { buildTerritorialDossier } from "@/lib/territory/territorialDossier";
import type { OperationalContextModuleId } from "@/types/moduleOperationalContext";

export const dynamic = "force-dynamic";

const VALID_MODULE_IDS: OperationalContextModuleId[] = ["argus-atlas", "argus-vigia", "argus-oraculo", "argus-talos"];

/**
 * Expediente territorial de un incidente canónico (Prompt 7). Misma
 * identidad de incidente (`module` + `id`) que
 * `GET /api/modules/incidents/[id]` y `GET /api/modules/incidents/[id]/impact`
 * — no otra API territorial paralela. Mismo gateo (OPERATOR+ además del
 * control de acceso por módulo) y mismo patrón de rate limiting que el
 * endpoint de impacto (Prompt 6).
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { user, response: authResponse } = await requireOperator();
  if (authResponse || !user) {
    return authResponse ?? NextResponse.json({ error: "Autenticación requerida." }, { status: 401 });
  }

  const rateLimitOutcome = await enforceRateLimit({
    policy: "territorial_dossier_read",
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
    const dossier = await buildTerritorialDossier(incidentContext.data);
    return NextResponse.json(dossier);
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
