import { NextRequest, NextResponse } from "next/server";
import { buildRouteMetadata } from "@/lib/routes/officialRouteRegistry";
import { getOperationalRoutesForScenario } from "@/lib/routing/routingIntelligenceService";
import { isDemoDataAllowed } from "@/lib/security/productionGuard";

export const dynamic = "force-dynamic";

/**
 * ARGUS Prompt 9/10 (DATA-1): `getOperationalRoutesForScenario` siempre
 * devuelve rutas demo (`isDemo: true` forzado en `buildRouteMetadata`) sin
 * ningun guard de produccion. En produccion sin `ARGUS_ALLOW_DEMO_DATA` se
 * devuelve una lista vacia en vez de rutas sinteticas.
 */
export async function GET(request: NextRequest) {
  if (!isDemoDataAllowed()) {
    return NextResponse.json({
      source: "unavailable",
      sourceType: "DEMO",
      officialStatus: "DEMO_ONLY",
      isDemo: false,
      disclaimer: null,
      count: 0,
      routes: [],
    });
  }
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
