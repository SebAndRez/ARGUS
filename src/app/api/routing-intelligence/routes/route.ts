import { NextRequest, NextResponse } from "next/server";
import { buildRouteMetadata } from "@/lib/routes/officialRouteRegistry";
import { getOperationalRoutesForScenario } from "@/lib/routing/routingIntelligenceService";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const scenarioId = request.nextUrl.searchParams.get("scenarioId") ?? undefined;
  const routeMetadata = buildRouteMetadata({ isDemo: true });
  const routes = getOperationalRoutesForScenario(scenarioId).map((route) => ({
    ...route,
    sourceType: routeMetadata.sourceType,
    officialStatus: routeMetadata.officialStatus,
    isDemo: routeMetadata.isDemo,
    disclaimer: routeMetadata.disclaimer,
  }));

  return NextResponse.json({
    source: "demo",
    sourceType: routeMetadata.sourceType,
    officialStatus: routeMetadata.officialStatus,
    isDemo: routeMetadata.isDemo,
    disclaimer: routeMetadata.disclaimer,
    count: routes.length,
    routes,
  });
}
