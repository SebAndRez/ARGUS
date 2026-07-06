import { NextResponse } from "next/server";
import { getArgusSource } from "@/config/argusSourceRegistry";
import {
  getOrFetchUsgsEarthquakes,
  USGS_SOURCE_ID,
} from "@/lib/ingestion/ingestUsgsEarthquakes";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await getOrFetchUsgsEarthquakes();

  if ("error" in result) {
    const timedOut = result.timedOut === true;
    return NextResponse.json(
      {
        error: result.error,
        sourceId: USGS_SOURCE_ID,
        sourceName: getArgusSource(USGS_SOURCE_ID)?.name ?? "USGS Earthquake",
        cached: false,
        ...(result.upstreamStatus ? { upstreamStatus: result.upstreamStatus } : {}),
      },
      { status: result.upstreamStatus ? 502 : timedOut ? 504 : 502 }
    );
  }

  return NextResponse.json(result);
}
