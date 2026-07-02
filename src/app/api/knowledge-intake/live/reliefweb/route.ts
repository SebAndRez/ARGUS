import { NextRequest, NextResponse } from "next/server";
import { fetchReliefWebReports } from "@/lib/knowledge-intake/adapters/reliefwebAdapter";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? "10");
    const result = await fetchReliefWebReports({
      country: request.nextUrl.searchParams.get("country") ?? undefined,
      disasterType: request.nextUrl.searchParams.get("disasterType") ?? undefined,
      limit: Number.isFinite(limit) ? limit : 10,
    });
    return NextResponse.json(result, { status: result.status === "requiresConfiguration" ? 503 : 200 });
  } catch (error) {
    return NextResponse.json(
      {
        adapterId: "reliefwebAdapter",
        sourceId: "reliefweb",
        status: "error",
        error: error instanceof Error ? error.message : "ReliefWeb ingestion failed",
      },
      { status: 502 }
    );
  }
}
