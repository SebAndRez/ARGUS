import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getLatestSourceCacheMetadataByPrefix,
  getSourceCacheMetadata,
} from "@/lib/ingestion/sourceCache";
import { buildSourceHealthSummary } from "@/lib/sources/sourceHealthEngine";
import { requireOperator } from "@/lib/security/apiGuards";

export const dynamic = "force-dynamic";

const cacheKeyBySource: Record<string, string> = {
  usgs_earthquake: "ingestion:usgs_earthquake",
  gdacs: "ingestion:gdacs",
  noaa_tsunami: "ingestion:noaa_tsunami",
};

function getCacheForSource(sourceId: string) {
  if (sourceId === "met_norway") return getLatestSourceCacheMetadataByPrefix("ingestion:met_norway:");
  if (sourceId === "nasa_firms") return getLatestSourceCacheMetadataByPrefix("ingestion:nasa_firms:");
  if (sourceId === "reliefweb") return getLatestSourceCacheMetadataByPrefix("ingestion:reliefweb:");
  const key = cacheKeyBySource[sourceId];
  return key ? getSourceCacheMetadata(key) : null;
}

export async function GET() {
  // ARGUS Prompt 9/10 (OBS-1): esta ruta legacy era publica y sin auth,
  // exponiendo `run.error` crudo dentro de `warnings` (getSourceWarnings()
  // interpola el mensaje de error tal cual, ver sourceHealthEngine.ts).
  // Confirmado sin consumidores vivos en `src` (el unico componente que la
  // llama, SourceStatusPanel.tsx, no esta montado en ninguna pagina) — se
  // gatea igual que /api/vigia/source-health en vez de solo acotar la tasa.
  const { response: authResponse } = await requireOperator();
  if (authResponse) return authResponse;

  let persistedCounts = new Map<string, number>();
  let latestRuns = new Map<string, {
    status: string;
    fetchedAt: Date;
    completedAt: Date | null;
    count: number | null;
    cached: boolean;
    error: string | null;
  }>();

  try {
    const [counts, runs, codigoAzulCount, telecomConnectivityCount] = await Promise.all([
      prisma.externalEvent.groupBy({ by: ["sourceId"], _count: { _all: true } }),
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
      // Código Azul persiste en CriticalPoi, no ExternalEvent — mismo
      // per-source special-casing que getCacheForSource() de abajo.
      prisma.criticalPoi.count({ where: { source: "official_open_data" } }),
      // Conectividad de emergencia persiste en TelecomConnectivityStatus, no
      // ExternalEvent — mismo patron de special-casing que Código Azul.
      prisma.telecomConnectivityStatus.count(),
    ]);
    persistedCounts = new Map(counts.map((item) => [item.sourceId, item._count._all]));
    persistedCounts.set("codigo_azul", codigoAzulCount);
    persistedCounts.set("telecom_connectivity_manual", telecomConnectivityCount);
    runs.forEach((run) => {
      if (!latestRuns.has(run.sourceId)) latestRuns.set(run.sourceId, run);
    });
  } catch {
    persistedCounts = new Map();
    latestRuns = new Map();
  }

  const runtime = Array.from(new Set([...persistedCounts.keys(), ...latestRuns.keys()])).map((sourceId) => ({
    sourceId,
    cache: getCacheForSource(sourceId),
    persistedCount: persistedCounts.get(sourceId) ?? 0,
    latestRun: latestRuns.get(sourceId) ?? null,
  }));

  const summary = buildSourceHealthSummary(runtime);

  return NextResponse.json({
    ...summary,
    sources: summary.sources.map((source) => ({
      id: source.id,
      name: source.name,
      category: source.category,
      reliability: source.reliability,
      status: source.status,
      isOfficial: source.isOfficial,
      isDemo: source.isDemo,
      lastUpdatedAt: source.lastUpdatedAt,
      warnings: source.warnings,
      refreshIntervalMinutes: source.refreshIntervalMinutes,
      persistedCount: source.persistedCount,
      freshnessLabel: source.freshnessLabel,
    })),
  });
}
