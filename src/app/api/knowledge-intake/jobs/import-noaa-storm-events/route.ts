import { NextResponse } from "next/server";
import { runNoaaStormEventsImport, type NoaaStormEventsImportJobInput } from "@/lib/knowledge-intake/persistence/knowledgeIngestionJobs";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as NoaaStormEventsImportJobInput;
    if (!body.year) {
      return NextResponse.json(
        {
          status: "invalidRequest",
          sourceId: "noaa-storm-events",
          sourceRole: "historical_training_dataset",
          isLiveSource: false,
          errors: ["year is required"],
          warnings: ["Use a controlled year/state/eventTypes/limit import. Global bulk historical imports are not allowed."],
        },
        { status: 400 }
      );
    }
    const result = await runNoaaStormEventsImport({
      year: body.year,
      state: body.state,
      eventTypes: body.eventTypes,
      limit: body.limit ?? 1000,
      offset: body.offset ?? 0,
      persist: true,
      mode: "import",
      minDeaths: body.minDeaths,
      minInjuries: body.minInjuries,
      hasCoordinates: body.hasCoordinates,
    });
    return NextResponse.json(result, { status: result.status === "failed" ? 500 : 200 });
  } catch (error) {
    return NextResponse.json(
      {
        status: "failed",
        sourceId: "noaa-storm-events",
        error: error instanceof Error ? error.message : "NOAA Storm Events import job failed",
      },
      { status: 500 }
    );
  }
}
