import { NextResponse } from "next/server";
import { ARGUS_VERSION } from "@/lib/observability/version";

export const dynamic = "force-dynamic";

/**
 * ARGUS Prompt 19 §22 — endpoint público mínimo de liveness. Solo responde
 * "¿el proceso puede responder?" — no consulta base de datos, backend
 * distribuido ni fuentes. Nunca revela fuentes, credenciales, locks,
 * errores, stack traces ni infraestructura. Para salud operacional real
 * (jobs/fuentes/persistencia/notificaciones/mapa/módulos), ver
 * `GET /api/operations/health` (protegido, operador).
 */
export async function GET() {
  return NextResponse.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: ARGUS_VERSION,
  });
}
