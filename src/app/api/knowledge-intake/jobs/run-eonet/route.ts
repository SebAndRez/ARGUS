import { NextResponse } from "next/server";
import { runEonetKnowledgeIngestion, type EonetIngestionJobInput } from "@/lib/knowledge-intake/persistence/knowledgeIngestionJobs";

export const dynamic = "force-dynamic";

type RunEonetBody = EonetIngestionJobInput & {
  persist?: boolean;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as RunEonetBody;
    const result = await runEonetKnowledgeIngestion({
      status: body.status ?? "open",
      days: body.days ?? 30,
      start: body.start,
      end: body.end,
      categories: body.categories ?? ["wildfires", "severeStorms", "volcanoes", "floods", "landslides", "drought", "dustHaze"],
      limit: body.limit ?? 100,
      bbox: body.bbox,
      source: body.source,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        status: "failed",
        sourceId: "nasa-eonet",
        error: error instanceof Error ? error.message : "NASA EONET job failed",
      },
      { status: 500 }
    );
  }
}
