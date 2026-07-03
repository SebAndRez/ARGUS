import { NextRequest, NextResponse } from "next/server";
import { runAllConfiguredKnowledgeIngestion } from "@/lib/knowledge-intake/persistence/knowledgeIngestionJobs";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as { includeContextual?: boolean; includeHydrologicalContext?: boolean };
    const includeContextual = request.nextUrl.searchParams.get("includeContextual") === "true" || body.includeContextual === true;
    const includeHydrologicalContext = request.nextUrl.searchParams.get("includeHydrologicalContext") === "true" || body.includeHydrologicalContext === true;
    const results = await runAllConfiguredKnowledgeIngestion({ includeContextual, includeHydrologicalContext });
    return NextResponse.json({
      status: "completed",
      includeContextual,
      includeHydrologicalContext,
      results,
      note: "No Vercel Cron is configured yet; this endpoint runs on demand.",
    });
  } catch (error) {
    return NextResponse.json(
      { status: "failed", error: error instanceof Error ? error.message : "Knowledge run-all failed" },
      { status: 500 }
    );
  }
}
