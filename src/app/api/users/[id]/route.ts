import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/services/authService";
import { logAuditEvent } from "@/services/auditService";

const ALLOWED_ROLES = ["OPERATOR", "ADMIN"];

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: Request, ctx: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Usuario no autenticado." }, { status: 401 });
  }

  if (!ALLOWED_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Acceso no autorizado." }, { status: 403 });
  }

  const { id: userId } = await ctx.params;
  const body = await req.json();
  const role = body.role ? String(body.role).trim() : undefined;
  const accountStatus = body.accountStatus ? String(body.accountStatus).trim() : undefined;

  if (!role && !accountStatus) {
    return NextResponse.json({ error: "role o accountStatus requerido." }, { status: 400 });
  }

  const userToUpdate = await prisma.user.findUnique({ where: { id: userId } });
  if (!userToUpdate) {
    return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      role,
      accountStatus,
      updatedAt: new Date(),
    },
  });

  await logAuditEvent({
    actorUserId: user.id,
    action: "USER_UPDATE",
    targetType: "User",
    targetId: userId,
    metadata: { role, accountStatus },
  });

  return NextResponse.json({ user: updated });
}
