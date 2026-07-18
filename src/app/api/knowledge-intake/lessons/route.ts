import { NextRequest, NextResponse } from "next/server";
import { demoKnowledgeLessons } from "@/data/knowledgeIntakeDemo";
import { getKnowledgeLessons } from "@/lib/knowledge-intake/persistence/knowledgePersistenceService";
import { isDemoDataAllowed } from "@/lib/security/productionGuard";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const domain = request.nextUrl.searchParams.get("domain");
  const persisted = await getKnowledgeLessons({ domain: domain ?? undefined }).catch(() => []);
  if (persisted.length > 0) {
    return NextResponse.json({
      source: "persistent_memory",
      count: persisted.length,
      lessons: persisted,
    });
  }
  // ARGUS Prompt 9/10 (DATA-1): mismo patron que knowledge-intake/incidents.
  if (!isDemoDataAllowed()) {
    return NextResponse.json({ source: "unavailable", count: 0, lessons: [] });
  }
  const lessons = domain ? demoKnowledgeLessons.filter((lesson) => lesson.domain === domain) : demoKnowledgeLessons;
  return NextResponse.json({
    source: "demo_fallback",
    count: lessons.length,
    lessons,
  });
}
