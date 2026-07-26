import { NextResponse } from "next/server";
import { getModuleIncidentDetailContext } from "@/lib/modules/moduleOperationalContext";
import { resolveOperationalContextPackage } from "@/lib/operationalContext/operationalContextEngine";

export const dynamic = "force-dynamic";

/**
 * ARGUS Operational Context Engine — endpoint on-demand.
 *
 * No re-implementa acceso ni interpretación de incidente: reutiliza
 * `getModuleIncidentDetailContext` (mismo control de acceso y la misma
 * proyección canónica que ya consumen ATLAS/VIGÍA/ORÁCULO/TALOS). Se
 * consulta con el módulo `argus-atlas` porque el primer consumidor de este
 * motor es el centro de mando ATLAS — cualquier otro módulo con el mismo
 * nivel de acceso puede reutilizar este endpoint sin cambios.
 */

type RouteContext = { params: Promise<{ incidentId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { incidentId } = await context.params;
  if (!incidentId) {
    return NextResponse.json(
      { state: "unavailable", error: { code: "INVALID_INCIDENT_ID", message: "incidentId requerido." } },
      { status: 400 }
    );
  }

  const detail = await getModuleIncidentDetailContext("argus-atlas", incidentId);
  if (detail.state !== "available") {
    return NextResponse.json(detail, { status: statusForDetailState(detail.state) });
  }

  const result = await resolveOperationalContextPackage(detail.data);
  if (!result.activated) {
    return NextResponse.json({ state: "not_activated", reason: result.reason }, { status: 200 });
  }

  return NextResponse.json({ state: "available", data: result.contextPackage }, { status: 200 });
}

function statusForDetailState(state: string): number {
  if (state === "unauthorized") return 401;
  if (state === "insufficient_data") return 200;
  return 502;
}
