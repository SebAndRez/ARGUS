import { NextResponse } from "next/server";
import { ARGUS_SOURCE_REGISTRY } from "@/config/argusSourceRegistry";
import { prisma } from "@/lib/prisma";
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
  let persistedCounts = new Map<string, number>();
  let latestRuns = new Map<
    string,
    {
      status: string;
      fetchedAt: Date;
      completedAt: Date | null;
      count: number | null;
      cached: boolean;
      error: string | null;
    }
  >();

  try {
    const [counts, runs] = await Promise.all([
      prisma.externalEvent.groupBy({
        by: ["sourceId"],
        _count: { _all: true },
      }),
      prisma.ingestionRun.findMany({
        orderBy: { fetchedAt: "desc" },
        take: 100,
        select: {
          sourceId: true,
          status: true,
          fetchedAt: true,
          completedAt: true,
          count: true,
          cached: true,
          error: true,
        },
      }),
    ]);
    persistedCounts = new Map(
      counts.map((item) => [item.sourceId, item._count._all])
    );
    runs.forEach((run) => {
      if (!latestRuns.has(run.sourceId)) latestRuns.set(run.sourceId, run);
    });
  } catch {
    persistedCounts = new Map();
    latestRuns = new Map();
  }

  const sources = ARGUS_SOURCE_REGISTRY.map((source) => {
    const cacheKey = CACHE_KEYS[source.id as keyof typeof CACHE_KEYS];
    const configured =
      source.id === "nasa_firms"
        ? Boolean(process.env.NASA_FIRMS_MAP_KEY?.trim())
        : source.id === "reliefweb"
          ? Boolean(process.env.RELIEFWEB_APP_NAME?.trim())
          : null;
    const cache =
      source.id === "met_norway"
        ? getLatestSourceCacheMetadataByPrefix("ingestion:met_norway:")
        : source.id === "nasa_firms"
          ? getLatestSourceCacheMetadataByPrefix("ingestion:nasa_firms:")
          : source.id === "reliefweb"
            ? getLatestSourceCacheMetadataByPrefix("ingestion:reliefweb:")
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
      persistedCount: persistedCounts.get(source.id) ?? 0,
      latestIngestionRun: latestRuns.get(source.id) ?? null,
    };
  });

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    sources,
  });
}
