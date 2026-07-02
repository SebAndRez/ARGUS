import { NextResponse } from "next/server";
import { getAllKnowledgeSources, getKnowledgeSourceStats } from "@/lib/knowledge-intake/sourceRegistry";

export const dynamic = "force-dynamic";

export async function GET() {
  const sources = getAllKnowledgeSources();
  return NextResponse.json({
    count: sources.length,
    stats: getKnowledgeSourceStats(),
    sources,
  });
}
