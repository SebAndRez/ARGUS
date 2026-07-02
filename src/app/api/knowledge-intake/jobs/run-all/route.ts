import { NextResponse } from "next/server";
import { runAllConfiguredKnowledgeIngestion } from "@/lib/knowledge-intake/persistence/knowledgeIngestionJobs";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const results = await runAllConfiguredKnowledgeIngestion();
    return NextResponse.json({
      status: "completed",
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
