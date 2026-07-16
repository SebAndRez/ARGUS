import { NextRequest, NextResponse } from "next/server";
import { fetchSenapredAlerts } from "@/lib/adapters/senapred/senapredEventosAdapter";
import { acquireJobLock, responseForJobLockResult } from "@/lib/jobs/jobLock";
import { generateRunId } from "@/lib/jobs/runIdentity";

export const dynamic = "force-dynamic";

function splitList(value: string | null) {
  return value ? value.split(/[;,]/).map((item) => item.trim()).filter(Boolean) : undefined;
}

/**
 * Manual/ops testing endpoint for the live SENAPRED eventos adapter — signs
 * anonymous-identity AppSync requests the same way the public
 * senapred.cl/eventos/ page does. Exposes raw signals/warnings/errors for
 * debugging. The operational map's live data path is `/api/argus/events`,
 * which (Prompt 14) reads the persisted canonical `KnowledgeIncident` rows
 * instead of live-fetching, so this debug route is the only remaining live
 * consumer of `fetchSenapredAlerts()` — which itself now delegates to the
 * single canonical fetch (`fetchChileOfficialAlertsRaw`), never a second
 * independent AppSync pagination loop (Prompt 14 §8).
 *
 * Guarded by the shared `senapred-ingestion` lock (Prompt 13/14 §17): if the
 * scheduled Chile Alerts/Global Watch ingestion is mid-run, this debug
 * fetch is deferred rather than adding a third concurrent AppSync
 * consultation — acceptable for a manual diagnostic tool given the lock's
 * TTL (≤5 min) and that the same data will be visible moments later either
 * way.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const daysBack = Number(params.get("daysBack") ?? "30");

  const lock = await acquireJobLock({ name: "senapred-ingestion", runId: generateRunId() });
  if (!lock.acquired) return responseForJobLockResult(lock)!;

  try {
    const result = await fetchSenapredAlerts({
      fromDate: params.get("fromDate") ?? new Date(Date.now() - (Number.isFinite(daysBack) ? daysBack : 30) * 24 * 60 * 60_000).toISOString(),
      toDate: params.get("toDate") ?? undefined,
      regionCodes: splitList(params.get("regionCodes")),
    });

    return NextResponse.json({
      status: result.status,
      source: "SENAPRED",
      sourceId: result.sourceId,
      fetchedAt: result.fetchedAt,
      fetched: result.fetched,
      normalized: result.count,
      signals: result.signals,
      warnings: result.warnings,
      errors: result.errors,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        source: "SENAPRED",
        sourceId: "senapred_eventos",
        fetched: 0,
        normalized: 0,
        signals: [],
        warnings: [],
        errors: [error instanceof Error ? error.message : "SENAPRED live fetch failed"],
      },
      { status: 502 }
    );
  } finally {
    await lock.release();
  }
}
