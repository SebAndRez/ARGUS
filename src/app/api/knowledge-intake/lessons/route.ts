import { NextRequest, NextResponse } from "next/server";
import { demoKnowledgeLessons } from "@/data/knowledgeIntakeDemo";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const domain = request.nextUrl.searchParams.get("domain");
  const lessons = domain ? demoKnowledgeLessons.filter((lesson) => lesson.domain === domain) : demoKnowledgeLessons;
  return NextResponse.json({
    count: lessons.length,
    lessons,
  });
}
