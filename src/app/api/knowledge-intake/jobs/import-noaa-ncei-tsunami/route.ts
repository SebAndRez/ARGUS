import { NextResponse } from "next/server";
import { runNoaaNceiTsunamiImport, type NoaaNceiTsunamiImportJobInput } from "@/lib/knowledge-intake/persistence/knowledgeIngestionJobs";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as NoaaNceiTsunamiImportJobInput;
    const result = await runNoaaNceiTsunamiImport({
      dataset: body.dataset ?? "events-with-runups",
      eventId: body.eventId,
      year: body.year,
      startYear: body.startYear,
      endYear: body.endYear,
      country: body.country,
      region: body.region,
      bbox: body.bbox,
      minWaterHeight: body.minWaterHeight,
      minDeaths: body.minDeaths,
      cause: body.cause,
      validity: body.validity,
      includeRunups: body.includeRunups ?? true,
      maxRunupsPerEvent: body.maxRunupsPerEvent ?? 50,
      limit: body.limit ?? 500,
      offset: body.offset ?? 0,
      persist: true,
    });
    return NextResponse.json(result, { status: result.status === "failed" ? 400 : 200 });
  } catch (error) {
    return NextResponse.json(
      {
        status: "failed",
        sourceId: "noaa-ncei-tsunami",
        sourceRole: "historical_tsunami_dataset",
        isLiveSource: false,
        errors: [error instanceof Error ? error.message : "NOAA NCEI Historical Tsunami import job failed"],
      },
      { status: 500 }
    );
  }
}
