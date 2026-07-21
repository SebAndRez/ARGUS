import { NextRequest, NextResponse } from "next/server";
import { runCodigoAzulIngestion } from "@/lib/criticalPoi/criticalPoiCodigoAzulSync";
import { recordIngestionRun } from "@/lib/ingestion/persistExternalEvents";
import { acquireJobLock, isPreviewDeployment, logJobEvent, responseForJobLockResult } from "@/lib/jobs/jobLock";
import { resolveIdempotencyKey } from "@/lib/jobs/runIdentity";

export const dynamic = "force-dynamic";

/**
 * Scheduled-job entry point (see `.github/workflows/argus-cron-codigo-azul.yml`)
 * para la sincronizacion de albergues Codigo Azul — mismo patron que
 * `/api/jobs/run-chile-alerts`: secreto de cron fail-closed, idempotency
 * key, lock de pipeline, ejecucion, liberacion. Recorre GitHub Actions
 * (Vercel Hobby solo permite un cron diario) cada 6 horas por defecto.
 */
function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

async function runJob(request: NextRequest) {
  if (isPreviewDeployment()) {
    return NextResponse.json({ status: "error", error: "Jobs are disabled in preview deployments" }, { status: 403 });
  }
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

  const lock = await acquireJobLock({ name: "codigo-azul-shelters", runId });
  if (!lock.acquired) return responseForJobLockResult(lock)!;

  const startedAt = Date.now();
  logJobEvent("job_started", { pipeline: "codigo-azul-shelters" });
  try {
    const result = await runCodigoAzulIngestion();
    const durationMs = Date.now() - startedAt;
    await recordIngestionRun("codigo_azul", result.status, { count: result.recordsFetched, durationMs, metadata: result });
    logJobEvent(result.status === "success" || result.status === "partial_success" ? "job_completed" : "job_partial", {
      pipeline: "codigo-azul-shelters",
      durationMs,
    });
    return NextResponse.json(result);
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : "Código Azul sync failed";
    await recordIngestionRun("codigo_azul", "failed", { error: message, durationMs });
    logJobEvent("job_failed", { pipeline: "codigo-azul-shelters", durationMs });
    return NextResponse.json({ status: "error", error: message, runId }, { status: 502 });
  } finally {
    await lock.release();
  }
}

/** GitHub Actions trigger via POST (ver argus-cron-codigo-azul.yml). */
export async function POST(request: NextRequest) {
  return runJob(request);
}

/** GET tambien soportado por si el disparador prefiere GET (mismo criterio que run-chile-alerts). */
export async function GET(request: NextRequest) {
  return runJob(request);
}
