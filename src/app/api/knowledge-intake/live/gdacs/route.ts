import { NextRequest, NextResponse } from "next/server";
import { fetchGdacsEvents, type GdacsAlertLevel, type GdacsEventType } from "@/lib/knowledge-intake/adapters/gdacsAdapter";
import { runGdacsKnowledgeIngestion } from "@/lib/knowledge-intake/persistence/knowledgeIngestionJobs";

export const dynamic = "force-dynamic";

function splitList(value: string | null) {
  return value
    ? value.split(/[;,]/).map((item) => item.trim()).filter(Boolean)
    : undefined;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const limit = Number(params.get("limit") ?? "100");
  const page = Number(params.get("page") ?? "1");
  const daysBack = Number(params.get("daysBack") ?? "7");
  const persist = params.get("persist") === "true";
  const input = {
    eventTypes: splitList(params.get("eventTypes")) as GdacsEventType[] | undefined,
    fromDate: params.get("fromDate") ?? undefined,
    toDate: params.get("toDate") ?? undefined,
    daysBack: Number.isFinite(daysBack) ? daysBack : 7,
    alertLevels: splitList(params.get("alertLevels")) as GdacsAlertLevel[] | undefined,
    limit: Number.isFinite(limit) ? limit : 100,
    page: Number.isFinite(page) ? page : 1,
  };

  try {
    if (persist) {
      const result = await runGdacsKnowledgeIngestion(input);
      return NextResponse.json({
        ...result,
        source: "GDACS",
        requiresApiKey: false,
        requiresConfiguration: false,
        incidents: result.sampleIncidents,
      });
    }

    const result = await fetchGdacsEvents(input);
    return NextResponse.json({
      status: result.status,
      source: result.sourceName,
      sourceId: result.sourceId,
      requiresApiKey: false,
      requiresConfiguration: false,
      fetched: result.fetched,
      normalized: result.count,
      persisted: false,
      inserted: 0,
      updated: 0,
      skipped: 0,
      incidents: result.incidents,
      warnings: result.warnings,
      errors: result.errors,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        source: "GDACS",
        sourceId: "gdacs",
        requiresApiKey: false,
        requiresConfiguration: false,
        fetched: 0,
        normalized: 0,
        persisted: false,
        inserted: 0,
        updated: 0,
        skipped: 0,
        incidents: [],
        warnings: [],
        errors: [error instanceof Error ? error.message : "GDACS ingestion failed"],
      },
      { status: 502 }
    );
  }
}
