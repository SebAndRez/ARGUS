import { NextRequest, NextResponse } from "next/server";
import { getOperationalRoutesForScenario } from "@/lib/routing/routingIntelligenceService";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const scenarioId = request.nextUrl.searchParams.get("scenarioId") ?? undefined;
  const routes = getOperationalRoutesForScenario(scenarioId);

  return NextResponse.json({
    source: "demo",
    count: routes.length,
    routes,
  });
}
