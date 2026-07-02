import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const [incidents, documents, lessons, reviews] = await Promise.all([
    prisma.knowledgeIncident.findMany({
      where: { reviewStatus: { in: ["pending_review", "needs_more_evidence"] } },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prisma.knowledgeDocument.findMany({
      where: { reviewStatus: { in: ["pending_review", "needs_more_evidence"] } },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prisma.knowledgeLesson.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prisma.knowledgeAdminReview.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
  ]);

  return NextResponse.json({
    count: incidents.length + documents.length + reviews.length,
    incidents,
    documents,
    lessons,
    reviews,
  });
}
