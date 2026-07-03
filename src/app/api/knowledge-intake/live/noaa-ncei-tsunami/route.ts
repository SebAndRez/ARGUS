import { NextRequest, NextResponse } from "next/server";
import {
  fetchAndNormalizeNoaaNceiTsunamis,
  type NoaaNceiTsunamiDatasetType,
  type NoaaNceiTsunamiFetchParams,
} from "@/lib/knowledge-intake/adapters/noaaNceiTsunamiAdapter";
import { runNoaaNceiTsunamiImport } from "@/lib/knowledge-intake/persistence/knowledgeIngestionJobs";

export const dynamic = "force-dynamic";

function numberParam(searchParams: URLSearchParams, key: string) {
  const value = Number(searchParams.get(key));
  return Number.isFinite(value) ? value : undefined;
}

function paramsFromSearch(searchParams: URLSearchParams): NoaaNceiTsunamiFetchParams {
  const dataset = (searchParams.get("dataset") ?? "events-with-runups") as NoaaNceiTsunamiDatasetType;
  return {
    dataset,
    eventId: searchParams.get("eventId") ?? undefined,
    year: numberParam(searchParams, "year"),
    startYear: numberParam(searchParams, "startYear"),
    endYear: numberParam(searchParams, "endYear"),
    country: searchParams.get("country") ?? undefined,
    region: searchParams.get("region") ?? undefined,
    bbox: searchParams.get("bbox") ?? undefined,
    minWaterHeight: numberParam(searchParams, "minWaterHeight"),
    minDeaths: numberParam(searchParams, "minDeaths"),
    cause: searchParams.get("cause") ?? undefined,
    validity: searchParams.get("validity") ?? undefined,
    limit: numberParam(searchParams, "limit") ?? 100,
    offset: numberParam(searchParams, "offset") ?? 0,
    includeRunups: searchParams.get("includeRunups") === "false" ? false : true,
    maxRunupsPerEvent: numberParam(searchParams, "maxRunupsPerEvent") ?? 50,
    persist: searchParams.get("persist") === "true",
  };
}

export async function GET(request: NextRequest) {
  const params = paramsFromSearch(request.nextUrl.searchParams);
  try {
    if (params.persist) {
      const result = await runNoaaNceiTsunamiImport({ ...params, persist: true });
      return NextResponse.json({
        ...result,
        source: "NOAA NCEI Historical Tsunami",
        sourceId: "noaa-ncei-tsunami",
        sourceRole: "historical_tsunami_dataset",
        isLiveSource: false,
        requiresApiKey: false,
        citation: "NCEI/WDS Global Historical Tsunami Database, DOI 10.7289/V5PN93H7",
        fetchedEvents: result.fetchedEvents,
        fetchedRunups: result.fetchedRunups,
        normalizedEvents: result.filteredEvents,
        insertedIncidents: result.insertedIncidents,
        updatedIncidents: result.updatedIncidents,
        sampleIncidents: result.sampleIncidents,
      }, { status: result.status === "failed" ? 400 : 200 });
    }

    const result = await fetchAndNormalizeNoaaNceiTsunamis({ ...params, persist: false });
    return NextResponse.json({
      status: result.status,
      source: result.sourceName,
      sourceId: result.sourceId,
      sourceRole: result.sourceRole,
      isLiveSource: result.isLiveSource,
      requiresApiKey: result.requiresApiKey,
      citation: result.citation,
      eventsEndpoint: result.eventsEndpoint,
      runupsEndpoint: result.runupsEndpoint,
      fetchedEvents: result.fetchedEvents,
      fetchedRunups: result.fetchedRunups,
      normalizedEvents: result.normalizedEvents,
      normalizedRunups: result.normalizedRunups,
      insertedIncidents: 0,
      updatedIncidents: 0,
      evidenceCreated: 0,
      warnings: result.warnings,
      errors: result.errors,
      incidents: result.incidents,
      evidence: result.evidence,
      sampleIncidents: result.incidents.slice(0, 5),
      sampleRunups: result.sampleRunups,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        source: "NOAA NCEI Historical Tsunami",
        sourceId: "noaa-ncei-tsunami",
        sourceRole: "historical_tsunami_dataset",
        isLiveSource: false,
        requiresApiKey: false,
        citation: "NCEI/WDS Global Historical Tsunami Database, DOI 10.7289/V5PN93H7",
        fetchedEvents: 0,
        fetchedRunups: 0,
        normalizedEvents: 0,
        normalizedRunups: 0,
        insertedIncidents: 0,
        updatedIncidents: 0,
        evidenceCreated: 0,
        warnings: ["NOAA NCEI Historical Tsunami is historical only; verify official TSV/HaZEL endpoint availability and filters."],
        errors: [error instanceof Error ? error.message : "NOAA NCEI Historical Tsunami preview failed"],
        sampleIncidents: [],
        sampleRunups: [],
      },
      { status: 502 }
    );
  }
}
