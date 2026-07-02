import { NextResponse } from "next/server";
import { demoKnowledgeIncidents, demoKnowledgeLessons } from "@/data/knowledgeIntakeDemo";
import { getKnowledgeSourceStats } from "@/lib/knowledge-intake/sourceRegistry";

export const dynamic = "force-dynamic";

export async function GET() {
  const stats = getKnowledgeSourceStats();
  return NextResponse.json({
    module: "ARGUS Knowledge Intake Engine",
    status: "operational_stub",
    safetyMode: "informational_recommendations_only",
    sources: stats,
    incidentCount: demoKnowledgeIncidents.length,
    lessonCount: demoKnowledgeLessons.length,
    lastRun: {
      id: "demo-run-knowledge-intake",
      status: "published",
      normalizedCount: demoKnowledgeIncidents.length,
      errors: [],
    },
    limitations: [
      "No real API connectors are executed by this module.",
      "No storage, OCR, RAG or pgvector persistence is enabled yet.",
      "Human validation is required before operational decisions.",
    ],
  });
}
