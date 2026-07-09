import { NextRequest, NextResponse } from "next/server";
import { fetchSenapredAlerts } from "@/lib/adapters/senapred/senapredEventosAdapter";

export const dynamic = "force-dynamic";

function splitList(value: string | null) {
  return value ? value.split(/[;,]/).map((item) => item.trim()).filter(Boolean) : undefined;
}

/**
 * Manual/ops testing endpoint for the live SENAPRED eventos adapter — signs
 * anonymous-identity AppSync requests the same way the public
 * senapred.cl/eventos/ page does. Exposes raw signals/warnings/errors for
 * debugging; the operational map's live data path is
 * `/api/argus/events` (`src/app/api/argus/events/route.ts`), which calls the
 * same adapter with caching and falls back to `demoArgusEvents` only if the
 * live fetch fails or returns nothing.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const daysBack = Number(params.get("daysBack") ?? "30");

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
  }
}
