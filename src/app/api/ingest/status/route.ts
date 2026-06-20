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
    const configured =
      source.id === "nasa_firms"
        ? Boolean(process.env.NASA_FIRMS_MAP_KEY?.trim())
        : null;
    const cache =
      source.id === "met_norway"
        ? getLatestSourceCacheMetadataByPrefix("ingestion:met_norway:")
        : source.id === "nasa_firms"
          ? getLatestSourceCacheMetadataByPrefix("ingestion:nasa_firms:")
        : cacheKey
          ? getSourceCacheMetadata(cacheKey)
          : null;

    return {
      sourceId: source.id,
      sourceName: source.name,
      status: source.status,
      reliabilityScore: source.reliabilityScore,
      accessType: source.accessType,
      configured,
      lastKnownStatus:
        source.status === "active_if_configured"
          ? configured
            ? cache?.available
              ? "ready"
              : "not_checked"
            : "unconfigured"
          : source.status !== "active"
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
