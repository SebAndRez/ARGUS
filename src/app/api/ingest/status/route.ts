import { NextResponse } from "next/server";
import { ARGUS_SOURCE_REGISTRY } from "@/config/argusSourceRegistry";
import { getSourceCacheMetadata } from "@/lib/ingestion/sourceCache";

const USGS_CACHE_KEY = "ingestion:usgs_earthquake";

export const dynamic = "force-dynamic";

export async function GET() {
  const sources = ARGUS_SOURCE_REGISTRY.map((source) => ({
    sourceId: source.id,
    sourceName: source.name,
    status: source.status,
    reliabilityScore: source.reliabilityScore,
    accessType: source.accessType,
    cache:
      source.id === "usgs_earthquake"
        ? getSourceCacheMetadata(USGS_CACHE_KEY)
        : null,
  }));

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    sources,
  });
}
