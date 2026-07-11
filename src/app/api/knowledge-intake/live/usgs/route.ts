import { NextRequest, NextResponse } from "next/server";
import { fetchUsgsEarthquakes } from "@/lib/knowledge-intake/adapters/usgsAdapter";
import { runUsgsKnowledgeIngestion } from "@/lib/knowledge-intake/persistence/knowledgeIngestionJobs";
import { requireOperator } from "@/lib/security/apiGuards";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const feed = request.nextUrl.searchParams.get("feed");
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? "25");
    const minMagnitude = Number(request.nextUrl.searchParams.get("minMagnitude") ?? "");
    const persist = request.nextUrl.searchParams.get("persist") === "true";
    const normalizedFeed = feed === "significant" || feed === "day" || feed === "relevant" || feed === "week" ? feed : "relevant";
    if (persist) {
      const { user, response: authResponse } = await requireOperator();
      if (authResponse || !user) return authResponse ?? NextResponse.json({ error: "Autenticacion requerida." }, { status: 401 });
      const result = await runUsgsKnowledgeIngestion({
        feedType: normalizedFeed,
        limit: Number.isFinite(limit) ? limit : 25,
        minMagnitude: Number.isFinite(minMagnitude) ? minMagnitude : undefined,
      });
      return NextResponse.json(result);
    }
    const result = await fetchUsgsEarthquakes({
      feed: normalizedFeed,
      limit: Number.isFinite(limit) ? limit : 25,
      minMagnitude: Number.isFinite(minMagnitude) ? minMagnitude : undefined,
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
