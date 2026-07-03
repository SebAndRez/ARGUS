import { NextResponse } from "next/server";
import { demoKnowledgeIncidents, demoKnowledgeLessons } from "@/data/knowledgeIntakeDemo";
import { getEonetAdapterStatus } from "@/lib/knowledge-intake/adapters/eonetAdapter";
import { firmsAdapter } from "@/lib/knowledge-intake/adapters/firmsAdapter";
import { getGdacsAdapterStatus } from "@/lib/knowledge-intake/adapters/gdacsAdapter";
import { getNwsAdapterStatus } from "@/lib/knowledge-intake/adapters/nwsAdapter";
import { getNoaaStormEventsAdapterStatus } from "@/lib/knowledge-intake/adapters/noaaStormEventsAdapter";
import { getOpenFemaAdapterStatus } from "@/lib/knowledge-intake/adapters/openFemaAdapter";
import { getOpenMeteoAdapterStatus } from "@/lib/knowledge-intake/adapters/openMeteoAdapter";
import { getUsgsWaterAdapterStatus } from "@/lib/knowledge-intake/adapters/usgsWaterAdapter";
import { reliefwebAdapter } from "@/lib/knowledge-intake/adapters/reliefwebAdapter";
import { usgsAdapter } from "@/lib/knowledge-intake/adapters/usgsAdapter";
import { getUsgsVolcanoHansAdapterStatus } from "@/lib/knowledge-intake/adapters/usgsVolcanoHansAdapter";
import { planKnowledgeIngestion } from "@/lib/knowledge-intake/ingestionPlanner";
import { getKnowledgeHealthFromDb } from "@/lib/knowledge-intake/persistence/knowledgePersistenceService";
import { getAllKnowledgeSources } from "@/lib/knowledge-intake/sourceRegistry";
import { getKnowledgeSourceStats } from "@/lib/knowledge-intake/sourceRegistry";
import type { ArgusKnowledgeInputType } from "@/types/knowledgeIntake";

export const dynamic = "force-dynamic";

export async function GET() {
  const stats = getKnowledgeSourceStats();
  const dbHealth = await getKnowledgeHealthFromDb().catch((error) => ({
    error: error instanceof Error ? error.message : "Knowledge DB health unavailable",
    persistedSources: 0,
    latestIngestionRuns: [],
    persistedIncidents: 0,
    persistedDocuments: 0,
    persistedLessons: 0,
    pendingReviews: 0,
    incidentsByDomain: [],
  }));
  const sources = getAllKnowledgeSources();
  const parserInputs: ArgusKnowledgeInputType[] = ["pdf", "txt_markdown", "csv", "json", "docx", "xlsx", "geojson", "rss_atom", "html"];
  const sourcesRequiringApiKey = sources.filter((source) => source.status === "requiresApiKey");
  const sourcesRequiringConfiguration = sources.filter((source) => source.status === "requiresConfiguration");
  const stubSources = sources.filter((source) => source.status === "stub" || source.status === "planned");
  const activeSourceDetails = sources.filter((source) => source.status === "active" || source.status === "active_contextual" || source.status === "active_historical" || source.status === "active_institutional");
  const nwsStatus = getNwsAdapterStatus();
  const noaaStormStatus = getNoaaStormEventsAdapterStatus();
  const openFemaStatus = getOpenFemaAdapterStatus();
  const openMeteoStatus = getOpenMeteoAdapterStatus();
  const usgsWaterStatus = getUsgsWaterAdapterStatus();
  const noKeySources = sources.filter((source) => source.id === "usgs_earthquake" || source.id === "gdacs" || source.id === "nasa-eonet" || source.id === "usgs-volcano-hans" || source.id === "nws" || source.id === "open-meteo" || source.id === "usgs-water" || source.id === "noaa-storm-events" || source.id === "openfema");
  const optionalKeySources = sources.filter((source) => source.tags.some((tag) => tag.startsWith("optional_api_key:")));
  const fastActivationSources = sources.filter((source) => source.tags.includes("fast_activation") || source.tags.includes("no_api_key"));
  const contextualSources = sources.filter((source) => source.tags.includes("contextual_source") || source.sourceKinds.includes("contextual"));
  const historicalSources = sources.filter((source) => source.sourceKinds.includes("historical"));
  const datasetSources = sources.filter((source) => source.accessMethod === "dataset" || source.inputTypes.includes("downloaded_dataset"));
  const institutionalSources = sources.filter((source) => source.status === "active_institutional" || source.tags.includes("institutional_dataset"));
  return NextResponse.json({
    module: "ARGUS Knowledge Intake Engine",
    moduleVersion: "0.2-live-source-activation",
    buildVersion: "knowledge-intake-live-source-activation-phase",
    status: "controlled_live_ingestion",
    safetyMode: "informational_recommendations_only",
    totalSources: stats.total,
    activeSources: stats.active,
    activeSourceDetails: activeSourceDetails.map((source) => ({ id: source.id, name: source.name, status: source.status })),
    plannedSources: stats.planned,
    stubSources: stubSources.length,
    sourcesRequiringApiKey: sourcesRequiringApiKey.map((source) => ({
      id: source.id,
      name: source.name,
      requiredEnv: source.id === "nasa_firms" ? "NASA_FIRMS_MAP_KEY" : "unknown",
    })),
    sourcesRequiringConfiguration: sourcesRequiringConfiguration.map((source) => ({
      id: source.id,
      name: source.name,
      requiredEnv: source.id === "reliefweb" ? "RELIEFWEB_APP_NAME" : "unknown",
    })),
    noKeySources: noKeySources.map((source) => ({ id: source.id, name: source.name, status: source.status })),
    optionalKeySources: optionalKeySources.map((source) => ({
      id: source.id,
      name: source.name,
      optionalApiKey: source.tags.find((tag) => tag.startsWith("optional_api_key:"))?.replace("optional_api_key:", ""),
      apiKeyConfigured: source.id === "usgs-water" ? usgsWaterStatus.apiKeyConfigured : false,
      apiKeyRequired: false,
    })),
    historicalSources: historicalSources.map((source) => ({
      id: source.id,
      name: source.name,
      status: source.status,
      sourceRole: source.tags.find((tag) => tag.startsWith("sourceRole:"))?.replace("sourceRole:", "") ?? "historical_reference",
      isLiveSource: !source.tags.includes("isLiveSource:false"),
    })),
    datasetSources: datasetSources.map((source) => ({ id: source.id, name: source.name, status: source.status, accessMethod: source.accessMethod })),
    institutionalSources: institutionalSources.map((source) => ({
      id: source.id,
      name: source.name,
      status: source.status,
      sourceRole: source.tags.find((tag) => tag.startsWith("sourceRole:"))?.replace("sourceRole:", "") ?? "institutional_reference",
      isLiveSensor: false,
      institutionalLearning: source.tags.includes("institutionalLearning:enabled") ? "enabled" : "planned",
      playbookLearning: source.tags.includes("playbookLearning:enabled") ? "enabled" : "planned",
    })),
    fastActivationSources: fastActivationSources.map((source) => ({ id: source.id, name: source.name, status: source.status })),
    contextualSources: contextualSources.map((source) => ({
      id: source.id,
      name: source.name,
      status: source.status,
      role: source.tags.find((tag) => tag.startsWith("sourceRole:"))?.replace("sourceRole:", "") ?? "context",
      requiresApiKey: false,
      optionalApiKey: source.tags.find((tag) => tag.startsWith("optional_api_key:"))?.replace("optional_api_key:", ""),
    })),
    sourceCapabilities: [
      {
        sourceId: "usgs_earthquake",
        status: "active",
        ready: true,
        requiresApiKey: false,
        capabilities: ["earthquake_geojson", "technical_seismic_signal"],
      },
      {
        sourceId: "gdacs",
        status: "active",
        ready: true,
        requiresApiKey: false,
        capabilities: ["multi_hazard", "near_real_time", "global_awareness", "rss_fallback"],
      },
      {
        sourceId: "nasa-eonet",
        status: "active",
        ready: true,
        requiresApiKey: false,
        requiresConfiguration: false,
        capabilities: ["natural_events", "geojson", "json_fallback", "global_awareness", "map_layer:nasa_eonet_natural_events"],
        safetyLimit: "Global awareness only; not a local Chilean authority and not an automatic route/evacuation trigger.",
      },
      {
        sourceId: "usgs-volcano-hans",
        status: "active",
        ready: true,
        requiresApiKey: false,
        requiresConfiguration: false,
        capabilities: ["volcano_alerts", "recent_notices", "geojson_fallback", "map_layer:usgs_volcano_hans_alerts"],
        limitations: [
          "Official USGS source for USGS monitored volcanoes; not a complete worldwide volcano authority.",
          "Aviation color code is separate from terrestrial alert level and is not an automatic evacuation or route-closure trigger.",
        ],
        coverageNote: "USGS monitored volcanoes; global architecture supports additional regional volcano sources.",
      },
      {
        sourceId: "nws",
        status: "active",
        ready: true,
        requiresApiKey: false,
        requiresConfiguration: false,
        userAgentConfigured: nwsStatus.userAgentConfigured,
        requiredEnv: "NWS_USER_AGENT",
        warning: nwsStatus.warning,
        capabilities: ["active_alerts", "severity_urgency_certainty", "forecast_context", "map_layer:nws_weather_alerts"],
        limitations: [
          "Official weather alert source for the United States and NWS territories only.",
          "Not a complete worldwide weather source and not an automatic route, evacuation or critical-action trigger.",
        ],
        coverageNote: "United States and NWS territories; global architecture supports additional weather sources.",
      },
      {
        sourceId: "noaa-storm-events",
        status: "active_historical",
        ready: true,
        requiresApiKey: false,
        requiresConfiguration: false,
        officialSource: true,
        sourceRole: "historical_training_dataset",
        isLiveSource: false,
        coverage: "United States and NOAA/NWS territories",
        importMode: "controlled_year_state_eventType",
        runAllDefault: false,
        capabilities: noaaStormStatus.capabilities,
        mapLayer: noaaStormStatus.mapLayer,
        limitations: noaaStormStatus.limitations,
        dataQualityWarnings: [
          "Official historical data with methodological changes over time.",
          "Possible gaps, inconsistencies and coordinate/damage uncertainty.",
          "Use for historical memory, comparison and training; validate current risk with live official sources.",
        ],
      },
      {
        sourceId: "openfema",
        status: "active_institutional",
        ready: true,
        requiresApiKey: false,
        requiresConfiguration: false,
        officialSource: true,
        sourceRole: "disaster_declaration_recovery_dataset",
        isLiveSensor: false,
        coverage: openFemaStatus.coverage,
        importMode: openFemaStatus.importMode,
        runAllDefault: false,
        institutionalLearning: "enabled",
        playbookLearning: "enabled",
        capabilities: openFemaStatus.capabilities,
        mapLayer: openFemaStatus.mapLayer,
        limitations: openFemaStatus.limitations,
        institutionalLearningCapabilities: [
          "declared_disasters",
          "designated_areas",
          "assistance_programs",
          "recovery_context",
          "hazard_mitigation_context",
          "operational_precedents",
          "ARGUS Institutional Playbook input",
        ],
        dataQualityWarnings: [
          "OpenFEMA is official FEMA institutional data, not a live sensor or forecast.",
          "Coverage is limited to the United States and FEMA territories.",
          "ARGUS recommendations based on FEMA precedents are not official FEMA instructions or promises of federal assistance.",
        ],
      },
      {
        sourceId: "open-meteo",
        status: "active",
        ready: true,
        requiresApiKey: false,
        requiresConfiguration: false,
        licenseStatus: "nonCommercialFree",
        commercialUse: "requiresReview",
        institutionalUse: "requiresReview",
        freeUse: "nonCommercial",
        role: "weather_context",
        globalCoverage: true,
        alertSource: false,
        officialSource: false,
        capabilities: [
          "forecast_by_coordinate",
          "weather_context",
          "risk_factors",
          "nav_context",
          "aura_context",
          "fenix_context",
          "map_layer:open_meteo_weather_context",
        ],
        limitations: [
          "Context only; not an official weather alert source.",
          "No global bulk ingestion and no incident creation by default.",
          "No automatic evacuations, route closures or critical orders.",
          "Commercial or institutional use requires review.",
        ],
        coverageNote: "Global by coordinate; forecast_days defaults to 3 and is capped at 3 in this phase.",
      },
      {
        sourceId: "usgs-water",
        status: "active_contextual",
        ready: true,
        requiresApiKey: false,
        optionalApiKey: "USGS_WATER_API_KEY",
        apiKeyConfigured: usgsWaterStatus.apiKeyConfigured,
        apiKeyRequired: false,
        higherRateLimitAvailable: true,
        officialSource: true,
        sourceRole: "hydrological_monitoring_source",
        isIncidentSource: false,
        coverage: "United States and USGS monitored locations",
        modernApiPreferred: true,
        legacyFallbackAvailable: true,
        runAllDefault: false,
        phase1Capabilities: usgsWaterStatus.phase1Capabilities,
        phase2Planned: usgsWaterStatus.phase2Planned,
        capabilities: usgsWaterStatus.capabilities,
        mapLayer: usgsWaterStatus.mapLayer,
        layerType: usgsWaterStatus.layerType,
        isIncidentLayer: false,
        defaultVisible: false,
        parameters: ["00060", "00065"],
        limitations: usgsWaterStatus.limitations,
      },
      {
        sourceId: "reliefweb",
        status: "requiresConfiguration",
        ready: false,
        requiresConfiguration: true,
        requiredEnv: "RELIEFWEB_APP_NAME",
      },
      {
        sourceId: "nasa_firms",
        status: "requiresApiKey",
        ready: false,
        requiresApiKey: true,
        requiredEnv: "NASA_FIRMS_MAP_KEY",
      },
    ],
    sources: stats,
    incidentCount: demoKnowledgeIncidents.length,
    lessonCount: demoKnowledgeLessons.length,
    persistentMemory: dbHealth,
    lastIngestionRuns: [
      {
        id: "usgs-live-ready",
        sourceId: "usgs_earthquake",
        status: "ready",
        normalizedCount: 0,
        note: "Runs on demand through /api/knowledge-intake/live/usgs.",
      },
      {
        id: "gdacs-live-ready",
        sourceId: "gdacs",
        status: "ready",
        normalizedCount: 0,
        note: "Runs on demand through /api/knowledge-intake/live/gdacs or /api/knowledge-intake/jobs/run-gdacs.",
      },
      {
        id: "eonet-live-ready",
        sourceId: "nasa-eonet",
        status: "ready",
        normalizedCount: 0,
        note: "Runs on demand through /api/knowledge-intake/live/eonet or /api/knowledge-intake/jobs/run-eonet.",
      },
      {
        id: "usgs-volcano-hans-live-ready",
        sourceId: "usgs-volcano-hans",
        status: "ready",
        normalizedCount: 0,
        note: "Runs on demand through /api/knowledge-intake/live/usgs-volcano-hans or /api/knowledge-intake/jobs/run-usgs-volcano-hans.",
      },
      {
        id: "nws-live-ready",
        sourceId: "nws",
        status: nwsStatus.status,
        normalizedCount: 0,
        note: "Runs on demand through /api/knowledge-intake/live/nws or /api/knowledge-intake/jobs/run-nws.",
      },
      {
        id: "open-meteo-context-ready",
        sourceId: "open-meteo",
        status: openMeteoStatus.status,
        normalizedCount: 0,
        note: "Runs on demand through /api/knowledge-intake/live/open-meteo or as contextual enrichment through /api/knowledge-intake/jobs/run-open-meteo-context.",
      },
      {
        id: "usgs-water-context-ready",
        sourceId: "usgs-water",
        status: usgsWaterStatus.status,
        normalizedCount: 0,
        note: "Runs on demand through /api/knowledge-intake/live/usgs-water or as hydrological enrichment through /api/knowledge-intake/jobs/run-usgs-water-context. Not run-all default.",
      },
      {
        id: "noaa-storm-events-historical-ready",
        sourceId: "noaa-storm-events",
        status: noaaStormStatus.status,
        normalizedCount: 0,
        note: "Controlled historical preview/import only through /api/knowledge-intake/live/noaa-storm-events or /api/knowledge-intake/jobs/import-noaa-storm-events. Not run-all default.",
      },
      {
        id: "openfema-institutional-ready",
        sourceId: "openfema",
        status: openFemaStatus.status,
        normalizedCount: 0,
        note: "Controlled institutional preview/import only through /api/knowledge-intake/live/openfema or /api/knowledge-intake/jobs/import-openfema-disaster-declarations. Not run-all default.",
      },
      {
        id: "reliefweb-live-ready",
        sourceId: "reliefweb",
        status: reliefwebAdapter().status,
        normalizedCount: 0,
        note: "Runs on demand through /api/knowledge-intake/live/reliefweb.",
      },
      {
        id: "firms-key-check",
        sourceId: "nasa_firms",
        status: firmsAdapter().status,
        normalizedCount: 0,
        note: firmsAdapter().message,
      },
    ],
    adapterStatus: [usgsAdapter(), getGdacsAdapterStatus(), getEonetAdapterStatus(), getUsgsVolcanoHansAdapterStatus(), nwsStatus, noaaStormStatus, openFemaStatus, openMeteoStatus, usgsWaterStatus, reliefwebAdapter(), firmsAdapter()],
    licenseWarnings: [
      {
        sourceId: "open-meteo",
        licenseStatus: "nonCommercialFree",
        commercialUse: "requiresReview",
        institutionalUse: "requiresReview",
        note: "Review Open-Meteo paid API or self-hosting before contractual commercial/institutional use.",
      },
    ],
    parserStatus: parserInputs.map((inputType) => ({
      inputType,
      processor: planKnowledgeIngestion(inputType),
      status: inputType === "pdf" || inputType === "docx" || inputType === "xlsx" ? "parser_stub_or_text_preview" : "available",
    })),
    warnings: [
      "USGS, GDACS, NASA EONET and ReliefWeb execute only when their live endpoints are called.",
      "GDACS is a global awareness source and must not be presented as a local Chilean authority.",
      "NASA EONET is a NASA global natural-events source and must not be presented as a local Chilean authority or automatic critical-action trigger.",
      "USGS Volcano HANS is official for USGS monitored volcanoes, not a complete worldwide local volcano authority.",
      ...(nwsStatus.userAgentConfigured ? [] : ["NWS_USER_AGENT missing. NWS uses ARGUS/preview (contact-not-configured) fallback in preview/dev."]),
      "NWS is official for the United States and NWS territories only; ARGUS remains extensible for Open-Meteo, MET Norway, WMO and national weather agencies.",
      "NOAA Storm Events is a historical NOAA/NCEI dataset only; it is not live, not forecast, not global weather coverage and not run-all default.",
      "OpenFEMA is an institutional FEMA dataset only; it is not live, not forecast, not worldwide coverage and not run-all default.",
      "Open-Meteo is active as global weather context only; it is not an official alert source and commercial/institutional use requires review.",
      "USGS Water Data is active as official US hydrological context only; it is not worldwide coverage, a forecast, evacuation order, route closure or run-all default job.",
      "ReliefWeb v2 requires an approved RELIEFWEB_APP_NAME.",
      "NASA FIRMS requires NASA_FIRMS_MAP_KEY and remains disabled without it.",
      "Manual/file imports are preview normalization until storage and admin review are connected.",
    ],
    criticalMissingCapabilities: [
      "No storage, OCR, RAG or pgvector persistence is enabled yet.",
      "No automatic insertion into the operational map is enabled; map-events endpoint is read-only.",
      "No production ingestion scheduler exists.",
    ],
    limitations: [
      "Human validation is required before operational decisions.",
      "Volcano alert level and aviation color code must remain separate operational signals.",
      "ARGUS is prepared to add SERNAGEOMIN, JMA, IMO, PHIVOLCS, GNS Science, INGV, VAAC and Smithsonian/GVP later without treating HANS as worldwide local authority.",
      "Open-Meteo context may support Risk, Fenix, NAV and AURA analysis, but requires official validation for critical decisions.",
      "USGS Water context may support Risk, Fenix, NAV, AURA and Command Center hydrological panels, but sensor readings alone are not official flood orders.",
      "NOAA Storm Events may support historical memory, Risk, Fenix, NAV, AURA and map context, but never automatic critical decisions.",
      "OpenFEMA may support institutional memory, Risk, Fenix, NAV, AURA and map context, but never official FEMA instructions or automatic critical decisions.",
    ],
    dataQualityWarnings: [
      {
        sourceId: "noaa-storm-events",
        warnings: [
          "Official NOAA/NCEI historical records, not live alerts.",
          "Methodology, event types, completeness, damage values and coordinate precision vary over historical periods.",
        ],
      },
      {
        sourceId: "openfema",
        warnings: [
          "Official FEMA/OpenFEMA Disaster Declarations Summaries, not live alerts.",
          "Declarations and assistance programs are institutional records; do not infer current eligibility, route closures, evacuations or federal assistance promises.",
        ],
      },
    ],
  });
}
