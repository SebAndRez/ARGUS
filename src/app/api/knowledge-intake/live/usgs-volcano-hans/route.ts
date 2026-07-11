import { NextRequest, NextResponse } from "next/server";
import {
  fetchUsgsVolcanoHans,
  type UsgsVolcanoHansMode,
  type UsgsVolcanoHansObservatory,
} from "@/lib/knowledge-intake/adapters/usgsVolcanoHansAdapter";
import { runUsgsVolcanoHansKnowledgeIngestion } from "@/lib/knowledge-intake/persistence/knowledgeIngestionJobs";
import { requireOperator } from "@/lib/security/apiGuards";

export const dynamic = "force-dynamic";

function boolParam(value: string | null, fallback: boolean) {
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const days = Number(params.get("days") ?? "7");
  const limit = Number(params.get("limit") ?? "100");
  const persist = params.get("persist") === "true";
  const input = {
    mode: (params.get("mode") ?? "elevated") as UsgsVolcanoHansMode,
    observatory: (params.get("observatory") ?? "all") as UsgsVolcanoHansObservatory,
    days: Number.isFinite(days) ? days : 7,
    limit: Number.isFinite(limit) ? limit : 100,
    includeNotices: boolParam(params.get("includeNotices"), true),
    includeGeoJson: boolParam(params.get("includeGeoJson"), false),
  };

  try {
    if (persist) {
      const { user, response: authResponse } = await requireOperator();
      if (authResponse || !user) return authResponse ?? NextResponse.json({ error: "Autenticacion requerida." }, { status: 401 });
      const result = await runUsgsVolcanoHansKnowledgeIngestion(input);
      return NextResponse.json({
        ...result,
        source: "USGS Volcano HANS",
        sourceId: "usgs-volcano-hans",
        requiresApiKey: false,
        requiresConfiguration: false,
        persisted: true,
        incidents: result.sampleIncidents,
        evidence: result.sampleEvidence,
      });
    }

    const result = await fetchUsgsVolcanoHans(input);
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
      evidence: result.evidence,
      warnings: result.warnings,
      errors: result.errors,
      coverageNote: result.coverageNote,
      endpoints: {
        primary: result.endpoint,
        geoJson: result.geoJsonEndpoint,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        source: "USGS Volcano HANS",
        sourceId: "usgs-volcano-hans",
        requiresApiKey: false,
        requiresConfiguration: false,
        fetched: 0,
        normalized: 0,
        persisted: persist,
        inserted: 0,
        updated: 0,
        skipped: 0,
        incidents: [],
        evidence: [],
        warnings: [],
        errors: [error instanceof Error ? error.message : "USGS Volcano HANS ingestion failed"],
      },
      { status: persist ? 500 : 502 }
    );
  }
}
