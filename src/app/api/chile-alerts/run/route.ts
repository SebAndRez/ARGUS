import { NextRequest, NextResponse } from "next/server";
import { fetchChileOfficialAlertsRaw } from "@/lib/sources/chile/senapredProvider";
import { promoteChileOfficialAlerts } from "@/lib/incidents/chileAlertPromotionEngine";
import { chileAlertsSeed } from "@/data/chileAlertsSeed";
import { requireOperator } from "@/lib/security/apiGuards";
import { isDemoDataAllowed } from "@/lib/security/productionGuard";
import { enforceRateLimit, rateLimitResponseForOutcome } from "@/lib/security/rateLimit";
import { acquireJobLock, logJobEvent, responseForJobLockResult } from "@/lib/jobs/jobLock";
import { generateRunId, resolveIdempotencyKey } from "@/lib/jobs/runIdentity";

export const dynamic = "force-dynamic";

/**
 * Manual/production trigger for the Chile official-alerts pipeline: fetch
 * (or, with `?seed=true`, use the QA fixtures) -> classify -> promote into
 * persisted `KnowledgeIncident`/`KnowledgeEvidence` rows. Also the function
 * `/api/jobs/run-chile-alerts` calls for scheduled runs.
 *
 * `promoteChileOfficialAlerts()` is the SAME shared write path Global
 * Watch's SENAPRED source (`runSenapredSource` in globalWatchEngine.ts)
 * calls — the two pipelines are independently lockable (Prompt 13 §20
 * Opción B) but both write the same `KnowledgeIncident` rows for SENAPRED
 * alerts, so this critical section is additionally guarded by the shared
 * `senapred-ingestion` lock, nested inside whichever pipeline-level lock
 * the caller already holds.
 */
export async function runChileAlertsIngestion(useSeed: boolean, jobRunId?: string) {
  const senapredLock = await acquireJobLock({ name: "senapred-ingestion", runId: jobRunId ?? generateRunId() });
  if (!senapredLock.acquired) {
    return {
      status: (senapredLock.reason === "backend_unavailable" ? "failed" : "skipped_senapred_lock") as
        | "failed"
        | "skipped_senapred_lock",
      runId: null,
      inserted: 0,
      updated: 0,
      skipped: 0,
      notPromoted: 0,
      incidents: [],
      errors: [
        senapredLock.reason === "backend_unavailable"
          ? "SENAPRED ingestion lock backend unavailable."
          : "SENAPRED ingestion already running (Global Watch or another Chile Alerts run holds the shared lock).",
      ],
      fetched: 0,
      fetchWarnings: [] as string[],
      fetchErrors: [] as string[],
      seedMode: useSeed,
    };
  }

  try {
    if (useSeed) {
      const summary = await promoteChileOfficialAlerts(chileAlertsSeed);
      return { ...summary, fetched: chileAlertsSeed.length, fetchWarnings: [] as string[], fetchErrors: [] as string[], seedMode: true };
    }

    const { alerts, warnings, errors } = await fetchChileOfficialAlertsRaw();
    const summary = await promoteChileOfficialAlerts(alerts);
    return { ...summary, fetched: alerts.length, fetchWarnings: warnings, fetchErrors: errors, seedMode: false };
  } finally {
    await senapredLock.release();
  }
}

/**
 * Manual/production trigger — writes `KnowledgeIncident`/`KnowledgeEvidence`
 * on every call. Historically public (only `/api/jobs/run-chile-alerts`,
 * its scheduled-job alias, enforced `CRON_SECRET`); P0 stabilization fix:
 * this direct route must require the same operator/admin session already
 * used by other manual mutation endpoints (`requireOperator`), never a new
 * auth mechanism. `?seed=true` is additionally fenced off in production —
 * see `isDemoDataAllowed`.
 *
 * Orden (Prompt 13 §14): sesión → rate limit → idempotency key → lock
 * (`chile-alerts`, compartido con `/api/jobs/run-chile-alerts`) → pipeline
 * → liberar.
 */
export async function POST(request: NextRequest) {
  const { user, response } = await requireOperator();
  if (response || !user) return response ?? NextResponse.json({ error: "Autenticacion requerida." }, { status: 401 });

  const rateLimitOutcome = await enforceRateLimit({
    policy: "chile_alerts_manual_run",
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

  const useSeed = request.nextUrl.searchParams.get("seed") === "true";
  if (useSeed && !isDemoDataAllowed()) {
    return NextResponse.json(
      { status: "error", error: "seed=true no esta permitido en producción." },
      { status: 403 }
    );
  }

  const lock = await acquireJobLock({ name: "chile-alerts", runId });
  if (!lock.acquired) return responseForJobLockResult(lock)!;

  const startedAt = Date.now();
  logJobEvent("job_started", { pipeline: "chile-alerts" });
  try {
    const result = await runChileAlertsIngestion(useSeed, runId);
    logJobEvent(result.status === "success" ? "job_completed" : "job_partial", {
      pipeline: "chile-alerts",
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(result);
  } catch (error) {
    logJobEvent("job_failed", { pipeline: "chile-alerts", durationMs: Date.now() - startedAt });
    return NextResponse.json(
      { status: "error", error: error instanceof Error ? error.message : "Chile alerts ingestion failed", runId },
      { status: 502 }
    );
  } finally {
    await lock.release();
  }
}
