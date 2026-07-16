import { NextRequest, NextResponse } from "next/server";
import { runGlobalWatch } from "@/lib/vigia/globalWatchEngine";
import { acquireJobLock, logJobEvent, responseForJobLockResult } from "@/lib/jobs/jobLock";
import { resolveIdempotencyKey } from "@/lib/jobs/runIdentity";

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
 *
 * Orden (Prompt 13 §14): secreto → idempotency key → lock → pipeline →
 * registrar resultado → liberar lock. Comparte el lock `global-watch` con
 * `/api/vigia/run` (ejecución manual) — cron y manual nunca corren a la vez.
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

  const idempotency = resolveIdempotencyKey(request.headers);
  if (!idempotency.valid) {
    return NextResponse.json(
      { status: "error", error: "Invalid Idempotency-Key/X-Argus-Run-Id header." },
      { status: 400 }
    );
  }
  const runId = idempotency.runId;

  const lock = await acquireJobLock({ name: "global-watch", runId });
  if (!lock.acquired) return responseForJobLockResult(lock)!;

  const startedAt = Date.now();
  logJobEvent("job_started", { pipeline: "global-watch" });
  try {
    const summary = await runGlobalWatch({ runId });
    logJobEvent(summary.status === "success" ? "job_completed" : "job_partial", {
      pipeline: "global-watch",
      durationMs: Date.now() - startedAt,
      sourcesConsulted: summary.sourcesConsulted,
    });
    // El resumen expone solo contadores, ids de fuente y mensajes de error
    // acotados — nunca secretos ni payloads crudos de las APIs externas.
    return NextResponse.json(summary);
  } catch (error) {
    logJobEvent("job_failed", { pipeline: "global-watch", durationMs: Date.now() - startedAt });
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : "Global Watch job failed", runId },
      { status: 502 }
    );
  } finally {
    await lock.release();
  }
}

/** Compatible con schedulers que disparan por GET (p.ej. Vercel Cron). */
export async function GET(request: NextRequest) {
  return runJob(request);
}

export async function POST(request: NextRequest) {
  return runJob(request);
}
