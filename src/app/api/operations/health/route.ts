import { NextResponse } from "next/server";
import { requireOperator } from "@/lib/security/apiGuards";
import { getOperationalHealthSnapshot } from "@/lib/observability/operationsSnapshot";
import { logOperationalEvent } from "@/lib/observability/operationalEvents";

export const dynamic = "force-dynamic";

/**
 * ARGUS Prompt 19 §22-23 — vista consolidada de salud operacional para
 * operadores: plataforma, persistencia, backend distribuido, pipelines
 * (Global Watch / Chile Alerts), fuentes (delega en `getSourceOperationsHealth`,
 * no lo reimplementa), notificaciones/proyección/módulos, y problemas
 * activos. No reemplaza `/api/vigia/source-health(/full|/public)` — esos
 * siguen siendo la vista detallada por fuente.
 *
 * §10 (§48-33): si `getOperationalHealthSnapshot()` falla, esto NUNCA
 * responde 200 con un estado "healthy" fabricado — responde 503.
 */
export async function GET() {
  const { user, response } = await requireOperator();
  if (response || !user) return response ?? NextResponse.json({ error: "Acceso denegado." }, { status: 403 });

  try {
    const snapshot = await getOperationalHealthSnapshot();
    return NextResponse.json(snapshot);
  } catch (error) {
    logOperationalEvent({
      event: "operations_health_snapshot_failed",
      level: "error",
      component: "operations_health",
      detail: { message: error instanceof Error ? error.message : "unknown" },
    });
    return NextResponse.json(
      { status: "unavailable", error: "No fue posible calcular el estado operacional." },
      { status: 503 }
    );
  }
}
