import { NextRequest, NextResponse } from "next/server";
import { getModuleIncidentDetailContext } from "@/lib/modules/moduleOperationalContext";
import type { OperationalContextModuleId } from "@/types/moduleOperationalContext";

export const dynamic = "force-dynamic";

const VALID_MODULE_IDS: OperationalContextModuleId[] = ["argus-atlas", "argus-vigia", "argus-oraculo", "argus-talos"];

function statusForContext(state: string, errorCode: string | undefined): number {
  if (state === "available" || state === "degraded" || state === "insufficient_data") return 200;
  if (state === "unauthorized") return errorCode === "FORBIDDEN" ? 403 : 401;
  if (errorCode === "INCIDENT_NOT_FOUND") return 404;
  if (errorCode === "INVALID_INCIDENT_ID") return 400;
  return 502;
}

/**
 * Detalle de un único incidente canónico por identidad estable — usado por
 * la vista de detalle de VIGÍA y como entrada de ORÁCULO/TALOS (Prompt 17
 * §13-§14). Misma resolución de permisos que la lista (`?module=`).
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const moduleId = request.nextUrl.searchParams.get("module") as OperationalContextModuleId | null;
  if (!moduleId || !VALID_MODULE_IDS.includes(moduleId)) {
    return NextResponse.json(
      { state: "unavailable", error: { code: "INVALID_INCIDENT_ID", message: "Parámetro ?module= requerido y debe ser uno de los cuatro módulos soportados." } },
      { status: 400 }
    );
  }

  const result = await getModuleIncidentDetailContext(moduleId, id);
  return NextResponse.json(result, { status: statusForContext(result.state, "error" in result ? result.error.code : undefined) });
}
