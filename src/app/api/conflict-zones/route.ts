import { NextRequest, NextResponse } from "next/server";
import { curatedConflictZones } from "@/data/conflictZones";
import { canonicalizeDemoLikeEvent } from "@/lib/security/demoDataGuard";

export const dynamic = "force-dynamic";

/**
 * ARGUS v1.0.3.3 — none of the curated zones currently carry
 * placeholder/demo signals (only the two `curatedConflictEvents` entries
 * do), but every zone is run through the same guard as `/api/conflict-events`
 * so a future placeholder zone can't silently ship as `critical`.
 */
export async function GET(request: NextRequest) {
  const activeOnly = request.nextUrl.searchParams.get("active") !== "false";
  const scoped = activeOnly
    ? curatedConflictZones.filter((zone) => zone.isActive)
    : curatedConflictZones;

  const zones = scoped.map((zone) => {
    const patch = canonicalizeDemoLikeEvent({
      riskLevel: zone.riskLevel,
      title: zone.name,
      summary: zone.summary,
      sourceName: zone.sources.map((source) => source.sourceName).join(", "),
    });
    return {
      ...zone,
      riskLevel: patch.riskLevel ?? zone.riskLevel,
      isDemo: patch.isDemoLike,
    };
  });

  return NextResponse.json({
    source: "curated_static",
    count: zones.length,
    zones,
  });
}
