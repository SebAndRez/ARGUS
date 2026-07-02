import { NextRequest, NextResponse } from "next/server";
import { fetchFirmsActiveFires } from "@/lib/knowledge-intake/adapters/firmsAdapter";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const days = Number(request.nextUrl.searchParams.get("days") ?? "1");
    const result = await fetchFirmsActiveFires({
      bbox: request.nextUrl.searchParams.get("bbox") ?? undefined,
      source: request.nextUrl.searchParams.get("source") ?? undefined,
      days: Number.isFinite(days) ? days : 1,
    });
    return NextResponse.json(result, { status: result.status === "requiresApiKey" ? 503 : 200 });
  } catch (error) {
    return NextResponse.json(
      {
        adapterId: "firmsAdapter",
        sourceId: "nasa_firms",
        status: "error",
        error: error instanceof Error ? error.message : "NASA FIRMS ingestion failed",
      },
      { status: 502 }
    );
  }
}
