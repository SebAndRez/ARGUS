import { NextResponse } from "next/server";
import { requireOperator } from "@/lib/security/apiGuards";
import { getOperatorSourceHealthList } from "@/lib/vigia/sourceOperationsHealth";
import type { SourceOperationalStatus } from "@/lib/vigia/sourceOperationsRegistry";

export const dynamic = "force-dynamic";

const ALL_STATUSES: SourceOperationalStatus[] = [
  "operational",
  "degraded",
  "configured_not_scheduled",
  "manual_only",
  "missing_credentials",
  "not_configured",
  "stub",
  "broken",
  "disabled",
  "retired",
];

/**
 * ARGUS Prompt 16 — Source Health completo (vista de operador), sobre el
 * registro canónico de ~43 fuentes (`ARGUS_SOURCE_OPERATIONS_REGISTRY`), no
 * solo las 11 ya programadas de `/api/vigia/source-health` (que se deja
 * intacto para no romper el panel `/admin/source-health` existente — este
 * es un endpoint aditivo, no un reemplazo).
 *
 * Nunca expone: secretos, tokens, URLs privadas, payloads, stack traces
 * (Prompt 16 §17) — solo campos ya diseñados como seguros en
 * `OperatorSourceHealthEntry`.
 */
export async function GET() {
  const { user, response } = await requireOperator();
  if (response || !user) return response ?? NextResponse.json({ error: "Acceso denegado." }, { status: 403 });

  try {
    const sources = await getOperatorSourceHealthList();
    const totals = Object.fromEntries(
      ALL_STATUSES.map((status) => [status, sources.filter((source) => source.operationalStatus === status).length])
    );
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      totals: { count: sources.length, ...totals },
      sources,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No fue posible obtener la salud de fuentes." },
      { status: 502 }
    );
  }
}
