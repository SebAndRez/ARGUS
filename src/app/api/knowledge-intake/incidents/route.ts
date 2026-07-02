import { NextRequest, NextResponse } from "next/server";
import { demoKnowledgeIncidents } from "@/data/knowledgeIntakeDemo";

export const dynamic = "force-dynamic";

function parseLimit(value: string | null) {
  const parsed = Number(value ?? "50");
  return Number.isInteger(parsed) ? Math.min(200, Math.max(1, parsed)) : 50;
}

export async function GET(request: NextRequest) {
  const domain = request.nextUrl.searchParams.get("domain");
  const country = request.nextUrl.searchParams.get("country");
  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
  const incidents = demoKnowledgeIncidents
    .filter((incident) => (!domain || incident.domain === domain) && (!country || incident.country === country))
    .slice(0, limit);

  return NextResponse.json({
    count: incidents.length,
    incidents,
  });
}
