import { NextRequest, NextResponse } from "next/server";
import { runGlobalWatch } from "@/lib/vigia/globalWatchEngine";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Entry point programado de ARGUS Global Watch (ver
 * `.github/workflows/argus-global-watch.yml`): consulta todas las fuentes
 * globales activas y persiste incidentes/evidencias/notificaciones.
 *
 * Igual que `run-chile-alerts`, es una URL pública disparada por GitHub
 * Actions (Vercel Hobby solo permite cron diario) y DEBE fallar cerrado:
 * solo autoriza si `CRON_SECRET` está configurado en el servidor Y el
 * header `Authorization` coincide exactamente. Secreto ausente = todo
 * rechazado, nunca "abierto por defecto".
 */
function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

async function runJob(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ status: "error", error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await runGlobalWatch();
    // El resumen expone solo contadores, ids de fuente y mensajes de error
    // acotados — nunca secretos ni payloads crudos de las APIs externas.
    return NextResponse.json(summary);
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : "Global Watch job failed" },
      { status: 502 }
    );
  }
}

/** Compatible con schedulers que disparan por GET (p.ej. Vercel Cron). */
export async function GET(request: NextRequest) {
  return runJob(request);
}

export async function POST(request: NextRequest) {
  return runJob(request);
}
