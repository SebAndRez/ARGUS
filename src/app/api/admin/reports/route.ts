import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/services/auditService";
import { adjustTrustScore, applyStrike } from "@/services/reputationService";
import { requireOperator } from "@/lib/security/apiGuards";

export async function POST(req: Request) {
  const { user, response } = await requireOperator();
  if (response || !user) return response;

  const body = await req.json();
  const reportId = String(body.reportId || "").trim();
  const action = String(body.action || "").trim();
  const note = String(body.note || "").trim();

  if (!reportId || !action) {
    return NextResponse.json({ error: "reportId y action son requeridos." }, { status: 400 });
  }

  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) {
    return NextResponse.json({ error: "Reporte no encontrado." }, { status: 404 });
  }

  let status = report.status;
  let auditAction = "REPORT_UPDATE";
  const metadata: Record<string, unknown> = { note, previousStatus: report.status };

  switch (action) {
    case "VALIDATE":
      status = "VALIDATED";
      auditAction = "REPORT_VALIDATED";
      await adjustTrustScore(report.userId, 5);
      break;
    case "DISCARD":
      status = "DISCARDED";
      auditAction = "REPORT_DISCARDED";
      await adjustTrustScore(report.userId, -5);
      break;
    case "FALSE":
      status = "DISCARDED";
      auditAction = "REPORT_FALSE_MALICIOUS";
      await adjustTrustScore(report.userId, -15);
      await applyStrike(report.userId, "Reporte falso malicioso detectado por operador");
      break;
    case "ESCALATE":
      status = "ESCALATED";
      auditAction = "REPORT_ESCALATED";
      break;
    case "RESOLVE":
      status = "RESOLVED";
      auditAction = "REPORT_RESOLVED";
      break;
    default:
      return NextResponse.json({ error: "Acción desconocida." }, { status: 400 });
  }

  const updatedReport = await prisma.report.update({
    where: { id: reportId },
    data: { status, updatedAt: new Date() },
  });

  await logAuditEvent({
    actorUserId: user.id,
    action: auditAction,
    targetType: "Report",
    targetId: reportId,
    metadata,
  });

  return NextResponse.json({ report: updatedReport });
}
