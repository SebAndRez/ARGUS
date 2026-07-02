import { NextRequest, NextResponse } from "next/server";
import { fetchUsgsEarthquakes } from "@/lib/knowledge-intake/adapters/usgsAdapter";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const feed = request.nextUrl.searchParams.get("feed");
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? "25");
    const result = await fetchUsgsEarthquakes({
      feed: feed === "significant" || feed === "day" || feed === "relevant" ? feed : "relevant",
      limit: Number.isFinite(limit) ? limit : 25,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        adapterId: "usgsAdapter",
        sourceId: "usgs_earthquake",
        status: "error",
        error: error instanceof Error ? error.message : "USGS ingestion failed",
      },
      { status: 502 }
    );
  }
}
