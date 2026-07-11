import { NextRequest, NextResponse } from "next/server";
import { runAllConfiguredKnowledgeIngestion } from "@/lib/knowledge-intake/persistence/knowledgeIngestionJobs";
import { explainRunAllBlockedSources, getDefaultRunAllSources } from "@/lib/source-governance/runAllPolicy";
import { requireOperator } from "@/lib/security/apiGuards";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { user, response: authResponse } = await requireOperator();
  if (authResponse || !user) return authResponse ?? NextResponse.json({ error: "Autenticacion requerida." }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({})) as { includeContextual?: boolean; includeHydrologicalContext?: boolean; includeCoastalObservationContext?: boolean; includeSeaLevelObservationContext?: boolean; includeAirQualityContext?: boolean; includeCriticalInfrastructureContext?: boolean; includeHumanitarianContext?: boolean; includePublicHealth?: boolean; includeEcdc?: boolean; includeMediaSignals?: boolean; includeGdelt?: boolean; includeFloodForecastContext?: boolean; includeObservedFloodContext?: boolean; includeCopernicusFlood?: boolean; includeVolcanoReports?: boolean; includeSmithsonianGvp?: boolean; includeImpact?: boolean; includeShakeMap?: boolean; includePager?: boolean; purpose?: string; maxIncidents?: number; radiusKm?: number; categories?: string[] };
    const includeContextual = request.nextUrl.searchParams.get("includeContextual") === "true" || body.includeContextual === true;
    const includeHydrologicalContext = request.nextUrl.searchParams.get("includeHydrologicalContext") === "true" || body.includeHydrologicalContext === true;
    const includeCoastalObservationContext = request.nextUrl.searchParams.get("includeCoastalObservationContext") === "true" || body.includeCoastalObservationContext === true;
    const includeSeaLevelObservationContext = request.nextUrl.searchParams.get("includeSeaLevelObservationContext") === "true" || body.includeSeaLevelObservationContext === true;
    const includeAirQualityContext = request.nextUrl.searchParams.get("includeAirQualityContext") === "true" || body.includeAirQualityContext === true;
    const includeCriticalInfrastructureContext = request.nextUrl.searchParams.get("includeCriticalInfrastructureContext") === "true" || body.includeCriticalInfrastructureContext === true;
    const includeHumanitarianContext = request.nextUrl.searchParams.get("includeHumanitarianContext") === "true" || body.includeHumanitarianContext === true;
    const includePublicHealth = request.nextUrl.searchParams.get("includePublicHealth") === "true" || body.includePublicHealth === true;
    const includeEcdc = request.nextUrl.searchParams.get("includeEcdc") === "true" || body.includeEcdc === true;
    const includeMediaSignals = request.nextUrl.searchParams.get("includeMediaSignals") === "true" || body.includeMediaSignals === true || request.nextUrl.searchParams.get("includeGdelt") === "true" || body.includeGdelt === true;
    const includeCopernicusFlood = request.nextUrl.searchParams.get("includeCopernicusFlood") === "true" || body.includeCopernicusFlood === true;
    const includeFloodForecastContext = request.nextUrl.searchParams.get("includeFloodForecastContext") === "true" || body.includeFloodForecastContext === true || includeCopernicusFlood;
    const includeObservedFloodContext = request.nextUrl.searchParams.get("includeObservedFloodContext") === "true" || body.includeObservedFloodContext === true || includeCopernicusFlood;
    const includeVolcanoReports = request.nextUrl.searchParams.get("includeVolcanoReports") === "true" || body.includeVolcanoReports === true;
    const includeSmithsonianGvp = request.nextUrl.searchParams.get("includeSmithsonianGvp") === "true" || body.includeSmithsonianGvp === true;
    const includeImpact = request.nextUrl.searchParams.get("includeImpact") === "true" || body.includeImpact === true;
    const includeShakeMap = request.nextUrl.searchParams.get("includeShakeMap") !== "false" && body.includeShakeMap !== false;
    const includePager = request.nextUrl.searchParams.get("includePager") !== "false" && body.includePager !== false;
    const results = await runAllConfiguredKnowledgeIngestion({
      includeContextual,
      includeHydrologicalContext,
      includeCoastalObservationContext,
      includeSeaLevelObservationContext,
      includeAirQualityContext,
      includeCriticalInfrastructureContext,
      includeVolcanoReports,
      includeSmithsonianGvp,
      includeImpact,
      includeShakeMap,
      includePager,
      purpose: body.purpose,
      maxIncidents: body.maxIncidents,
      radiusKm: body.radiusKm,
      categories: body.categories,
    });
    const governanceFlags = {
      includeMediaSignals,
      includeInfrastructureContext: includeCriticalInfrastructureContext,
      includeHumanitarianContext,
      includeWeatherContext: includeContextual,
      includeAirQualityContext,
      includeFloodForecastContext,
      includeObservedFloodContext,
      includeEarthquakeImpact: includeImpact,
      includeHealthContext: includePublicHealth || includeEcdc,
      includeCoastalOceanContext: includeCoastalObservationContext || includeSeaLevelObservationContext,
      includeHydrologicalContext,
      includeVolcanoMemory: includeVolcanoReports || includeSmithsonianGvp,
    };
    return NextResponse.json({
      status: "completed",
      includeContextual,
      includeHydrologicalContext,
      includeCoastalObservationContext,
      includeSeaLevelObservationContext,
      includeAirQualityContext,
      includeCriticalInfrastructureContext,
      includeHumanitarianContext,
      includePublicHealth,
      includeEcdc,
      includeMediaSignals,
      includeFloodForecastContext,
      includeObservedFloodContext,
      includeVolcanoReports,
      includeSmithsonianGvp,
      includeImpact,
      includeShakeMap,
      includePager,
      results,
      governance: {
        defaultSources: getDefaultRunAllSources(),
        blockedSources: explainRunAllBlockedSources(undefined, governanceFlags, {
          hasActiveIncident: true,
          hasSelectedIncident: true,
          hasAoi: includeContextual || includeHydrologicalContext || includeCoastalObservationContext || includeSeaLevelObservationContext || includeAirQualityContext || includeCriticalInfrastructureContext || includeFloodForecastContext || includeObservedFloodContext,
        }),
      },
      note: "No Vercel Cron is configured yet; this endpoint runs on demand. HDX/HAPI, GDELT, Copernicus, Smithsonian GVP catalog/history and USGS ShakeMap/PAGER event enrichment are not run-all defaults; dedicated bounded jobs are required.",
    });
  } catch (error) {
    return NextResponse.json(
      { status: "failed", error: error instanceof Error ? error.message : "Knowledge run-all failed" },
      { status: 500 }
    );
  }
}
