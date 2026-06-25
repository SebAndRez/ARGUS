import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { analyzeReport } from "@/services/crisisAnalysisService";
import { getCurrentUser } from "@/services/authService";
import { logAuditEvent } from "@/services/auditService";

const RESTRICTED_REPORT_STATUS = ["LIMITED", "SUSPENDED", "BANNED"];

export async function GET() {
  const reports = await prisma.report.findMany({
    include: { user: { select: { publicAlias: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ reports });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Usuario no autenticado." }, { status: 401 });
  }

  if (RESTRICTED_REPORT_STATUS.includes(user.accountStatus)) {
    return NextResponse.json({ error: "Cuenta restringida: no puede crear reportes normales." }, { status: 403 });
  }

  const body = await req.json();
  const category = String(body.category || "Otro").trim();
  const title = String(body.title || "").trim();
  const description = String(body.description || "").trim();
  const latitude = Number(body.latitude ?? 0);
  const longitude = Number(body.longitude ?? 0);
  const locationText = body.locationText ? String(body.locationText).trim() : null;
  const isMissingPerson = category === "missing_person";

  if (!title || !description || !latitude || !longitude) {
    return NextResponse.json({ error: "Título, descripción y ubicación son requeridos." }, { status: 400 });
  }

  const analysis = analyzeReport(title, description, category);
  const report = await prisma.report.create({
    data: {
      userId: user.id,
      category,
      title,
      description,
      latitude,
      longitude,
      locationText,
      severity: isMissingPerson && analysis.severity === "LOW" ? "MEDIUM" : analysis.severity,
      status: isMissingPerson ? "UNDER_REVIEW" : undefined,
      aiSummary: analysis.aiSummary,
      aiRecommendation: isMissingPerson
        ? "Validar datos minimos, no exponer contacto personal y coordinar busqueda/rescate si coincide con evento activo."
        : analysis.aiRecommendation,
      aiConfidence: isMissingPerson ? Math.min(analysis.aiConfidence, 72) : analysis.aiConfidence,
      falseReportRisk: analysis.falseReportRisk,
    },
  });

  await logAuditEvent({
    actorUserId: user.id,
    action: "CREATE_REPORT",
    targetType: "Report",
    targetId: report.id,
    metadata: { category, title, locationText, severity: report.severity, missingPerson: isMissingPerson },
  });

  return NextResponse.json({ report });
}
