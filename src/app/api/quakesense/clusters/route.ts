import { NextRequest, NextResponse } from "next/server";
import { getQuakeSenseClusters } from "@/lib/quakesense/quakesenseMemoryStore";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const limit = Math.min(50, Math.max(1, Number(request.nextUrl.searchParams.get("limit") ?? 10)));
  const clusters = getQuakeSenseClusters(true).slice(0, limit);

  return NextResponse.json({
    source: "quakesense_memory_demo",
    count: clusters.length,
    clusters,
    notice:
      "QuakeSense es experimental. No reemplaza CSN, SENAPRED, SHOA, USGS ni fuentes oficiales.",
  });
}
