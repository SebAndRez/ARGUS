import { NextResponse } from "next/server";
import {
  runUsgsVolcanoHansKnowledgeIngestion,
  type UsgsVolcanoHansIngestionJobInput,
} from "@/lib/knowledge-intake/persistence/knowledgeIngestionJobs";

export const dynamic = "force-dynamic";

type RunUsgsVolcanoHansBody = UsgsVolcanoHansIngestionJobInput & {
  persist?: boolean;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as RunUsgsVolcanoHansBody;
    const result = await runUsgsVolcanoHansKnowledgeIngestion({
      mode: body.mode ?? "elevated",
      observatory: body.observatory ?? "all",
      days: body.days ?? 7,
      includeNotices: body.includeNotices ?? true,
      includeGeoJson: body.includeGeoJson ?? true,
      limit: body.limit ?? 100,
      persist: true,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        status: "failed",
        sourceId: "usgs-volcano-hans",
        error: error instanceof Error ? error.message : "USGS Volcano HANS job failed",
      },
      { status: 500 }
    );
  }
}
