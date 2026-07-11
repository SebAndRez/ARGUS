import { NextResponse } from "next/server";
import { requireOperator } from "@/lib/security/apiGuards";
import { getVigiaSourceHealth } from "@/lib/vigia/sourceRegistry";

export const dynamic = "force-dynamic";

/**
 * Salud de las fuentes de ARGUS Global Watch para el panel
 * `/admin/source-health`: registry declarativo unido con el estado runtime
 * (última corrida, errores, eventos obtenidos, incidentes persistidos).
 */
export async function GET() {
  const { user, response } = await requireOperator();
  if (response || !user) return response ?? NextResponse.json({ error: "Acceso denegado." }, { status: 403 });

  try {
    const sources = await getVigiaSourceHealth();
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      totals: {
        sources: sources.length,
        ok: sources.filter((source) => source.status === "OK").length,
        warn: sources.filter((source) => source.status === "WARN").length,
        error: sources.filter((source) => source.status === "ERROR").length,
        disabled: sources.filter((source) => source.status === "DISABLED").length,
      },
      sources,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No fue posible obtener la salud de fuentes." },
      { status: 502 }
    );
  }
}
