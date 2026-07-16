import { NextRequest, NextResponse } from "next/server";
import { curatedConflictEvents } from "@/data/conflictZones";
import { canonicalizeDemoLikeEvent } from "@/lib/security/demoDataGuard";

export const dynamic = "force-dynamic";

/**
 * ARGUS v1.0.3.3 — this static curated feed mixes real curated conflict
 * signals with entries that are honestly placeholder (`sourceName:
 * "ReliefWeb placeholder"`, `"GDELT placeholder"`) for feeds not yet wired
 * up live. Never downgrade the raw `severity` value silently for consumers
 * that expect it, but flag `isDemo` and cap `severity` when demo data isn't
 * allowed (production, no `ARGUS_ALLOW_DEMO_DATA`) so a placeholder entry
 * can never be read as `critical` by a caller that only checks severity.
 */
export async function GET(request: NextRequest) {
  const zoneId = request.nextUrl.searchParams.get("zoneId")?.trim();
  const scoped = zoneId
    ? curatedConflictEvents.filter((event) => event.relatedZoneId === zoneId)
    : curatedConflictEvents;

  const events = scoped.map((event) => {
    const patch = canonicalizeDemoLikeEvent({
      severity: event.severity,
      sourceName: event.sourceName,
      sourceUrl: event.sourceUrl,
      rawProvider: event.rawProvider,
      relatedIncidentId: event.relatedZoneId,
      title: event.title,
    });
    return {
      ...event,
      severity: patch.severity ?? event.severity,
      isDemo: patch.isDemoLike,
    };
  });

  return NextResponse.json({
    source: "curated_static",
    count: events.length,
    events,
  });
}
