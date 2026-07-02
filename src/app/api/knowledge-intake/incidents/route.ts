import { NextRequest, NextResponse } from "next/server";
import { demoKnowledgeIncidents } from "@/data/knowledgeIntakeDemo";
import { getKnowledgeIncidents } from "@/lib/knowledge-intake/persistence/knowledgePersistenceService";

export const dynamic = "force-dynamic";

function parseLimit(value: string | null) {
  const parsed = Number(value ?? "50");
  return Number.isInteger(parsed) ? Math.min(200, Math.max(1, parsed)) : 50;
}

export async function GET(request: NextRequest) {
  const domain = request.nextUrl.searchParams.get("domain");
  const country = request.nextUrl.searchParams.get("country");
  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
  const persisted = await getKnowledgeIncidents({
    domain: domain ?? undefined,
    limit,
  }).catch(() => []);
  if (persisted.length > 0) {
    return NextResponse.json({
      source: "persistent_memory",
      count: persisted.length,
      incidents: persisted,
    });
  }
  const incidents = demoKnowledgeIncidents
    .filter((incident) => (!domain || incident.domain === domain) && (!country || incident.country === country))
    .slice(0, limit);

  return NextResponse.json({
    source: "demo_fallback",
    count: incidents.length,
    incidents,
  });
}
