import { NextResponse } from "next/server";
import { getPublicSourceHealthList } from "@/lib/vigia/sourceOperationsHealth";

export const dynamic = "force-dynamic";

/**
 * ARGUS Prompt 16 — Source Health público (§17, §25): sin autenticación,
 * pero deliberadamente limitado a `available | degraded | unavailable` por
 * fuente — nunca último error, duración, conteo de registros, credenciales,
 * URLs ni razón interna del estado. Distinto del endpoint de operador
 * (`/api/vigia/source-health/full`, protegido por `requireOperator()`).
 */
export async function GET() {
  try {
    const sources = await getPublicSourceHealthList();
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      totals: {
        available: sources.filter((source) => source.level === "available").length,
        degraded: sources.filter((source) => source.level === "degraded").length,
        unavailable: sources.filter((source) => source.level === "unavailable").length,
      },
      sources,
    });
  } catch {
    return NextResponse.json({ error: "No fue posible obtener el estado de fuentes." }, { status: 502 });
  }
}
