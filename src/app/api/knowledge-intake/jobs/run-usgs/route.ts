import { NextResponse } from "next/server";
import { runUsgsKnowledgeIngestion } from "@/lib/knowledge-intake/persistence/knowledgeIngestionJobs";

export const dynamic = "force-dynamic";

type RunUsgsBody = {
  feedType?: "significant" | "day" | "week" | "relevant";
  minMagnitude?: number;
  limit?: number;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as RunUsgsBody;
    const result = await runUsgsKnowledgeIngestion({
      feedType: body.feedType ?? "relevant",
      minMagnitude: body.minMagnitude,
      limit: body.limit,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { status: "failed", error: error instanceof Error ? error.message : "USGS job failed" },
      { status: 500 }
    );
  }
}
