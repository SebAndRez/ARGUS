import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOperator } from "@/lib/security/apiGuards";

export const dynamic = "force-dynamic";

type ReviewBody = {
  targetType: "incident" | "evidence" | "lesson" | "document";
  status: "approved" | "rejected" | "needs_more_evidence" | "pending";
  notes?: string;
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireOperator();
  if (response || !user) return response;

  const { id } = await context.params;
  const body = (await request.json()) as ReviewBody;
  if (!body.targetType || !body.status) {
    return NextResponse.json({ error: "targetType and status are required." }, { status: 400 });
  }

  // `reviewerId` always comes from the authenticated session (`user.id`,
  // from `requireOperator` above), never from the request body — a
  // client-supplied `reviewerId` would let one operator's action be
  // attributed to another operator in the review trail.
  const review = await prisma.knowledgeAdminReview.create({
    data: {
      targetType: body.targetType,
      targetId: id,
      status: body.status,
      reviewerId: user.id,
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
