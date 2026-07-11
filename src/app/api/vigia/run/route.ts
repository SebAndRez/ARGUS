import { NextRequest, NextResponse } from "next/server";
import { requireOperator } from "@/lib/security/apiGuards";
import { runGlobalWatch } from "@/lib/vigia/globalWatchEngine";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Ejecución manual de ARGUS Global Watch desde el Command Center / panel
 * Source Health. Requiere usuario admin u operador (a diferencia del
 * endpoint de cron, que usa Bearer CRON_SECRET).
 *
 * Query params:
 * - `?seed=true`  → usa fixtures QA en lugar de APIs externas.
 * - `?source=<id>` → fuerza actualización de una sola fuente (repetible).
 */
export async function POST(request: NextRequest) {
  const { user, response } = await requireOperator();
  if (response || !user) return response ?? NextResponse.json({ error: "Acceso denegado." }, { status: 403 });

  const params = request.nextUrl.searchParams;
  const seedMode = params.get("seed") === "true";
  const onlySources = params.getAll("source").map((value) => value.trim()).filter(Boolean);

  try {
    const summary = await runGlobalWatch({
      seedMode,
      onlySources: onlySources.length > 0 ? onlySources : undefined,
    });
    return NextResponse.json(summary);
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : "Global Watch run failed" },
      { status: 502 }
    );
  }
}
