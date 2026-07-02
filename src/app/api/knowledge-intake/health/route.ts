import { NextResponse } from "next/server";
import { demoKnowledgeIncidents, demoKnowledgeLessons } from "@/data/knowledgeIntakeDemo";
import { firmsAdapter } from "@/lib/knowledge-intake/adapters/firmsAdapter";
import { reliefwebAdapter } from "@/lib/knowledge-intake/adapters/reliefwebAdapter";
import { usgsAdapter } from "@/lib/knowledge-intake/adapters/usgsAdapter";
import { planKnowledgeIngestion } from "@/lib/knowledge-intake/ingestionPlanner";
import { getAllKnowledgeSources } from "@/lib/knowledge-intake/sourceRegistry";
import { getKnowledgeSourceStats } from "@/lib/knowledge-intake/sourceRegistry";
import type { ArgusKnowledgeInputType } from "@/types/knowledgeIntake";

export const dynamic = "force-dynamic";

export async function GET() {
  const stats = getKnowledgeSourceStats();
  const sources = getAllKnowledgeSources();
  const adapterStatus = [usgsAdapter(), reliefwebAdapter(), firmsAdapter()];
  const parserInputs: ArgusKnowledgeInputType[] = ["pdf", "txt_markdown", "csv", "json", "docx", "xlsx", "geojson", "rss_atom", "html"];
  const sourcesRequiringApiKey = sources.filter((source) => source.status === "requiresApiKey");
  const sourcesRequiringConfiguration = sources.filter((source) => source.status === "requiresConfiguration");
  const stubSources = sources.filter((source) => source.status === "stub" || source.status === "planned");
  return NextResponse.json({
    module: "ARGUS Knowledge Intake Engine",
    moduleVersion: "0.2-live-source-activation",
    buildVersion: "knowledge-intake-live-source-activation-phase",
    status: "controlled_live_ingestion",
    safetyMode: "informational_recommendations_only",
    totalSources: stats.total,
    activeSources: stats.active,
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
    sources: stats,
    incidentCount: demoKnowledgeIncidents.length,
    lessonCount: demoKnowledgeLessons.length,
    lastIngestionRuns: [
      {
        id: "usgs-live-ready",
        sourceId: "usgs_earthquake",
        status: "ready",
        normalizedCount: 0,
        note: "Runs on demand through /api/knowledge-intake/live/usgs.",
      },
      {
        id: "reliefweb-live-ready",
        sourceId: "reliefweb",
        status: "ready",
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
    adapterStatus,
    parserStatus: parserInputs.map((inputType) => ({
      inputType,
      processor: planKnowledgeIngestion(inputType),
      status: inputType === "pdf" || inputType === "docx" || inputType === "xlsx" ? "parser_stub_or_text_preview" : "available",
    })),
    warnings: [
      "USGS and ReliefWeb execute only when their live endpoints are called.",
      "ReliefWeb v2 requires an approved RELIEFWEB_APP_NAME.",
      "NASA FIRMS requires NASA_FIRMS_MAP_KEY and remains disabled without it.",
      "Manual/file imports are preview normalization until storage and admin review are connected.",
    ],
    criticalMissingCapabilities: [
      "No storage, OCR, RAG or pgvector persistence is enabled yet.",
      "No automatic insertion into the operational map is enabled.",
      "No production ingestion scheduler exists.",
    ],
    limitations: ["Human validation is required before operational decisions."],
  });
}
