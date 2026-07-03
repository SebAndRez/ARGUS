import { NextRequest, NextResponse } from "next/server";
import {
  fetchAndNormalizeOpenFemaDisasterDeclarations,
  type OpenFemaDisasterDeclarationsParams,
} from "@/lib/knowledge-intake/adapters/openFemaAdapter";
import { runOpenFemaDisasterDeclarationsImport } from "@/lib/knowledge-intake/persistence/knowledgeIngestionJobs";

export const dynamic = "force-dynamic";

function listParam(value: string | null) {
  return value?.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
}

function paramsFromSearch(searchParams: URLSearchParams): OpenFemaDisasterDeclarationsParams & { dataset?: string } {
  const year = Number(searchParams.get("year"));
  const disasterNumber = searchParams.get("disasterNumber") ?? searchParams.get("disaster_number") ?? undefined;
  return {
    dataset: searchParams.get("dataset") ?? "disaster-declarations",
    year: Number.isFinite(year) ? year : undefined,
    state: searchParams.get("state") ?? undefined,
    incidentTypes: listParam(searchParams.get("incidentTypes") ?? searchParams.get("incident_types")),
    declarationType: searchParams.get("declarationType") ?? searchParams.get("declaration_type") ?? undefined,
    disasterNumber,
    limit: Number(searchParams.get("limit") ?? "100"),
    skip: Number(searchParams.get("skip") ?? "0"),
    persist: searchParams.get("persist") === "true",
    mode: "preview",
  };
}

function hasControlledFilter(params: OpenFemaDisasterDeclarationsParams) {
  return Boolean(params.year || params.state || params.disasterNumber || params.incidentTypes?.length);
}

export async function GET(request: NextRequest) {
  const params = paramsFromSearch(request.nextUrl.searchParams);
  if (params.dataset && params.dataset !== "disaster-declarations") {
    return NextResponse.json(
      {
        status: "invalidRequest",
        source: "OpenFEMA",
        sourceId: "openfema",
        sourceRole: "disaster_declaration_recovery_dataset",
        isLiveSensor: false,
        requiresApiKey: false,
        requiresConfiguration: false,
        fetched: 0,
        normalized: 0,
        persisted: 0,
        incidents: [],
        institutionalLessons: [],
        operationalPrecedents: [],
        warnings: ["OpenFEMA phase 1 only supports dataset=disaster-declarations."],
        errors: ["unsupported dataset"],
      },
      { status: 400 }
    );
  }
  if (params.persist && !hasControlledFilter(params)) {
    return NextResponse.json(
      {
        status: "invalidRequest",
        source: "OpenFEMA",
        sourceId: "openfema",
        sourceRole: "disaster_declaration_recovery_dataset",
        isLiveSensor: false,
        requiresApiKey: false,
        requiresConfiguration: false,
        fetched: 0,
        normalized: 0,
        persisted: 0,
        incidents: [],
        institutionalLessons: [],
        operationalPrecedents: [],
        warnings: ["OpenFEMA persist=true requires a controlled filter and never imports all Disaster Declarations Summaries at once."],
        errors: ["year, state, disasterNumber or incidentTypes is required for persist=true"],
      },
      { status: 400 }
    );
  }

  try {
    if (params.persist) {
      const result = await runOpenFemaDisasterDeclarationsImport({ ...params, persist: true, mode: "import" });
      return NextResponse.json({
        ...result,
        source: "OpenFEMA",
        sourceId: "openfema",
        sourceRole: "disaster_declaration_recovery_dataset",
        isLiveSensor: false,
        requiresApiKey: false,
        requiresConfiguration: false,
        persisted: result.inserted + result.updated,
        incidents: result.sampleIncidents,
        institutionalLessons: [],
        operationalPrecedents: result.samplePrecedents,
      });
    }

    const result = await fetchAndNormalizeOpenFemaDisasterDeclarations({ ...params, persist: false, mode: "preview" });
    return NextResponse.json({
      status: result.status,
      source: result.sourceName,
      sourceId: result.sourceId,
      sourceRole: result.sourceRole,
      isLiveSensor: result.isLiveSensor,
      requiresApiKey: result.requiresApiKey,
      requiresConfiguration: result.requiresConfiguration,
      fetched: result.fetched,
      normalized: result.normalized,
      persisted: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      evidenceCreated: 0,
      incidents: result.incidents,
      evidence: result.evidence,
      institutionalLessons: result.institutionalLessons,
      operationalPrecedents: result.operationalPrecedents,
      warnings: result.warnings,
      errors: result.errors,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        source: "OpenFEMA",
        sourceId: "openfema",
        sourceRole: "disaster_declaration_recovery_dataset",
        isLiveSensor: false,
        requiresApiKey: false,
        requiresConfiguration: false,
        fetched: 0,
        normalized: 0,
        persisted: 0,
        inserted: 0,
        updated: 0,
        skipped: 0,
        evidenceCreated: 0,
        incidents: [],
        institutionalLessons: [],
        operationalPrecedents: [],
        warnings: ["OpenFEMA is an institutional historical/periodic dataset, not a live sensor. Retry with controlled filters and a bounded limit."],
        errors: [error instanceof Error ? error.message : "OpenFEMA preview failed"],
      },
      { status: 502 }
    );
  }
}
