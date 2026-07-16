import { NextRequest, NextResponse } from "next/server";
import { curatedNewsEvidence } from "@/data/conflictZones";
import { isDemoLikeSource } from "@/lib/security/demoDataGuard";

export const dynamic = "force-dynamic";

/**
 * ARGUS v1.0.3.3 — news evidence is secondary context, never a notification
 * or alert (it isn't fed into `buildArgusNotifications`), so there's no
 * severity/pinning to cap here. Still flag `isDemo` (e.g. the GDELT context
 * item whose summary says "para demo MVP") so a consumer never presents it
 * as confirmed, verified evidence.
 */
export async function GET(request: NextRequest) {
  const zoneId = request.nextUrl.searchParams.get("zoneId")?.trim();
  const scoped = zoneId
    ? curatedNewsEvidence.filter((item) => item.linkedZoneId === zoneId)
    : curatedNewsEvidence;

  const evidence = scoped.map((item) => ({
    ...item,
    isDemo: isDemoLikeSource({
      title: item.title,
      summary: item.summary,
      sourceName: item.sourceName,
      sourceUrl: item.url,
      relatedIncidentId: item.linkedZoneId ?? item.linkedEventId,
    }),
  }));

  return NextResponse.json({
    source: "curated_static",
    count: evidence.length,
    evidence,
  });
}
