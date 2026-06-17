import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { analyzeHelpRequest } from "@/services/crisisAnalysisService";
import { getCurrentUser } from "@/services/authService";
import { logAuditEvent } from "@/services/auditService";

const RESTRICTED_ACCOUNT = ["LIMITED", "SUSPENDED", "BANNED"];

export async function GET() {
  const helpRequests = await prisma.helpRequest.findMany({
    include: { user: { select: { publicAlias: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ helpRequests });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Usuario no autenticado." }, { status: 401 });
  }

  const body = await req.json();
  const category = String(body.category || "Otro").trim();
  const title = String(body.title || "").trim();
  const description = String(body.description || "").trim();
  const priority = String(body.priority || "MEDIUM").trim() as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  const latitude = Number(body.latitude ?? 0);
  const longitude = Number(body.longitude ?? 0);
  const locationText = body.locationText ? String(body.locationText).trim() : null;

  if (!title || !description || !latitude || !longitude) {
    return NextResponse.json({ error: "Título, descripción y ubicación son requeridos." }, { status: 400 });
  }

  const analysis = analyzeHelpRequest(title, description, category);
  const restrictedMode = RESTRICTED_ACCOUNT.includes(user.accountStatus);

  const helpRequest = await prisma.helpRequest.create({
    data: {
      userId: user.id,
      category,
      title,
      description,
      latitude,
      longitude,
      locationText,
      priority,
      restrictedMode,
      aiSummary: analysis.aiSummary,
      aiRecommendation: analysis.aiRecommendation,
      aiConfidence: analysis.aiConfidence,
    },
  });

  await logAuditEvent({
    actorUserId: user.id,
    action: "CREATE_HELP_REQUEST",
    targetType: "HelpRequest",
    targetId: helpRequest.id,
    metadata: { category, title, restrictedMode },
  });

  return NextResponse.json({ helpRequest, restrictedMode });
}
