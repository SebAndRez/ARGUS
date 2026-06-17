import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/services/authService";
import { logAuditEvent } from "@/services/auditService";

const ALLOWED_ROLES = ["OPERATOR", "ADMIN"];

export async function PATCH(req: Request, ctx: any) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Usuario no autenticado." }, { status: 401 });
  }

  if (!ALLOWED_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Acceso no autorizado." }, { status: 403 });
  }

  const requestId = ctx.params?.id;
  const body = await req.json();
  const action = String(body.action || "").trim();
  const note = String(body.note || "").trim();

  if (!action) {
    return NextResponse.json({ error: "Action es requerida." }, { status: 400 });
  }

  const helpRequest = await prisma.helpRequest.findUnique({ where: { id: requestId } });
  if (!helpRequest) {
    return NextResponse.json({ error: "Solicitud no encontrada." }, { status: 404 });
  }

  let status = helpRequest.status;
  let auditAction = "HELP_REQUEST_UPDATE";

  switch (action) {
    case "REVIEW":
      status = "UNDER_REVIEW";
      auditAction = "HELP_REQUEST_UNDER_REVIEW";
      break;
    case "ASSIGN":
      status = "ASSIGNED";
      auditAction = "HELP_REQUEST_ASSIGNED";
      break;
    case "RESOLVE":
      status = "RESOLVED";
      auditAction = "HELP_REQUEST_RESOLVED";
      break;
    case "CANCEL":
      status = "CANCELLED";
      auditAction = "HELP_REQUEST_CANCELLED";
      break;
    default:
      return NextResponse.json({ error: "Acción desconocida." }, { status: 400 });
  }

  const updatedRequest = await prisma.helpRequest.update({
    where: { id: requestId },
    data: { status, updatedAt: new Date() },
  });

  await logAuditEvent({
    actorUserId: user.id,
    action: auditAction,
    targetType: "HelpRequest",
    targetId: requestId,
    metadata: { note, previousStatus: helpRequest.status },
  });

  return NextResponse.json({ helpRequest: updatedRequest });
}
