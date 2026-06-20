import { NextResponse } from "next/server";
import { ARGUS_SOURCE_REGISTRY } from "@/config/argusSourceRegistry";
import {
  getLatestSourceCacheMetadataByPrefix,
  getSourceCacheMetadata,
} from "@/lib/ingestion/sourceCache";

const CACHE_KEYS = {
  usgs_earthquake: "ingestion:usgs_earthquake",
  gdacs: "ingestion:gdacs",
  noaa_tsunami: "ingestion:noaa_tsunami",
} as const;

export const dynamic = "force-dynamic";

export async function GET() {
  const sources = ARGUS_SOURCE_REGISTRY.map((source) => {
    const cacheKey = CACHE_KEYS[source.id as keyof typeof CACHE_KEYS];
    const cache =
      source.id === "met_norway"
        ? getLatestSourceCacheMetadataByPrefix("ingestion:met_norway:")
        : cacheKey
          ? getSourceCacheMetadata(cacheKey)
          : null;

    return {
      sourceId: source.id,
      sourceName: source.name,
      status: source.status,
      reliabilityScore: source.reliabilityScore,
      accessType: source.accessType,
      lastKnownStatus:
        source.status !== "active"
          ? source.status
          : cache?.available
            ? "ready"
            : "not_checked",
      cache,
    };
  });

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    sources,
  });
}
