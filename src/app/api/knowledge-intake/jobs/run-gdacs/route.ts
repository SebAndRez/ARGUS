import { NextResponse } from "next/server";
import { runGdacsKnowledgeIngestion, type GdacsIngestionJobInput } from "@/lib/knowledge-intake/persistence/knowledgeIngestionJobs";

export const dynamic = "force-dynamic";

type RunGdacsBody = GdacsIngestionJobInput & {
  persist?: boolean;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as RunGdacsBody;
    const result = await runGdacsKnowledgeIngestion({
      eventTypes: body.eventTypes ?? ["EQ", "TC", "FL", "VO", "DR", "WF"],
      daysBack: body.daysBack ?? 7,
      alertLevels: body.alertLevels ?? ["red", "orange", "green"],
      fromDate: body.fromDate,
      toDate: body.toDate,
      limit: body.limit ?? 100,
      page: body.page,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        status: "failed",
        sourceId: "gdacs",
        error: error instanceof Error ? error.message : "GDACS job failed",
      },
      { status: 500 }
    );
  }
}
