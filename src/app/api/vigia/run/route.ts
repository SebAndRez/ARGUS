import { NextRequest, NextResponse } from "next/server";
import { requireOperator } from "@/lib/security/apiGuards";
import { isDemoDataAllowed } from "@/lib/security/productionGuard";
import { enforceRateLimit, rateLimitResponseForOutcome } from "@/lib/security/rateLimit";
import { runGlobalWatch } from "@/lib/vigia/globalWatchEngine";
import { acquireJobLock, logJobEvent, responseForJobLockResult } from "@/lib/jobs/jobLock";
import { resolveIdempotencyKey } from "@/lib/jobs/runIdentity";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Ejecución manual de ARGUS Global Watch desde el Command Center / panel
 * Source Health. Requiere usuario admin u operador (a diferencia del
 * endpoint de cron, que usa Bearer CRON_SECRET). Comparte el lock
 * `global-watch` con `/api/jobs/run-global-watch` (Prompt 13 §14, Caso 11):
 * cron y manual nunca corren a la vez, sin importar cuál llegó primero.
 *
 * Orden: sesión → rate limit → idempotency key → lock → pipeline → liberar.
 *
 * Query params:
 * - `?seed=true`  → usa fixtures QA en lugar de APIs externas.
 * - `?source=<id>` → fuerza actualización de una sola fuente (repetible).
 */
export async function POST(request: NextRequest) {
  const { user, response } = await requireOperator();
  if (response || !user) return response ?? NextResponse.json({ error: "Acceso denegado." }, { status: 403 });

  const rateLimitOutcome = await enforceRateLimit({
    policy: "vigia_manual_run",
    request,
    identity: { userId: user.id },
  });
  const rateLimitedResponse = rateLimitResponseForOutcome(rateLimitOutcome);
  if (rateLimitedResponse) return rateLimitedResponse;

  const idempotency = resolveIdempotencyKey(request.headers);
  if (!idempotency.valid) {
    return NextResponse.json(
      { status: "error", error: "Invalid Idempotency-Key/X-Argus-Run-Id header." },
      { status: 400 }
    );
  }
  const runId = idempotency.runId;

  const params = request.nextUrl.searchParams;
  const seedMode = params.get("seed") === "true";
  if (seedMode && !isDemoDataAllowed()) {
    return NextResponse.json({ status: "error", error: "seed=true no esta permitido en produccion." }, { status: 403 });
  }
  const onlySources = params.getAll("source").map((value) => value.trim()).filter(Boolean);

  const lock = await acquireJobLock({ name: "global-watch", runId });
  if (!lock.acquired) return responseForJobLockResult(lock)!;

  const startedAt = Date.now();
  logJobEvent("job_started", { pipeline: "global-watch" });
  try {
    const summary = await runGlobalWatch({
      seedMode,
      onlySources: onlySources.length > 0 ? onlySources : undefined,
      runId,
    });
    logJobEvent(summary.status === "success" ? "job_completed" : "job_partial", {
      pipeline: "global-watch",
      durationMs: Date.now() - startedAt,
      sourcesConsulted: summary.sourcesConsulted,
    });
    return NextResponse.json(summary);
  } catch (error) {
    logJobEvent("job_failed", { pipeline: "global-watch", durationMs: Date.now() - startedAt });
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : "Global Watch run failed", runId },
      { status: 502 }
    );
  } finally {
    await lock.release();
  }
}
