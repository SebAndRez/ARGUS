import { NextRequest, NextResponse } from "next/server";
import { fetchSenapredAlerts } from "@/lib/adapters/senapred/senapredEventosAdapter";

export const dynamic = "force-dynamic";

function splitList(value: string | null) {
  return value ? value.split(/[;,]/).map((item) => item.trim()).filter(Boolean) : undefined;
}

/**
 * Manual/ops testing endpoint for the live SENAPRED eventos adapter — signs
 * anonymous-identity AppSync requests the same way the public
 * senapred.cl/eventos/ page does. Not wired into the map's live data path;
 * the operational map still reads `demoArgusEvents` (see
 * `src/data/demoArgusEvents.ts`).
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
