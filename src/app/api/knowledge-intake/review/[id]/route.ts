import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type ReviewBody = {
  targetType: "incident" | "evidence" | "lesson" | "document";
  status: "approved" | "rejected" | "needs_more_evidence" | "pending";
  reviewerId?: string;
  notes?: string;
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = (await request.json()) as ReviewBody;
  if (!body.targetType || !body.status) {
    return NextResponse.json({ error: "targetType and status are required." }, { status: 400 });
  }

  const review = await prisma.knowledgeAdminReview.create({
    data: {
      targetType: body.targetType,
      targetId: id,
      status: body.status,
      reviewerId: body.reviewerId,
      notes: body.notes,
    },
  });

  if (body.targetType === "incident") {
    await prisma.knowledgeIncident.update({
      where: { id },
      data: { reviewStatus: body.status === "approved" ? "auto_accepted" : body.status },
    }).catch(() => null);
  }

  if (body.targetType === "document") {
    await prisma.knowledgeDocument.update({
      where: { id },
      data: { reviewStatus: body.status === "approved" ? "auto_accepted" : body.status },
    }).catch(() => null);
  }

  return NextResponse.json({ review });
}
