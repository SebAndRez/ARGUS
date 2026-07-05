import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/services/auditService";
import { requireOperator } from "@/lib/security/apiGuards";
import { canChangeUserRole } from "@/lib/security/rbac";
import type { ArgusRole } from "@/types/rbac";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: Request, ctx: RouteContext) {
  const { user, response } = await requireOperator();
  if (response || !user) return response;

  const { id: userId } = await ctx.params;
  const body = await req.json();
  const role = body.role ? (String(body.role).trim() as ArgusRole) : undefined;
  const accountStatus = body.accountStatus ? String(body.accountStatus).trim() : undefined;

  if (!role && !accountStatus) {
    return NextResponse.json({ error: "role o accountStatus requerido." }, { status: 400 });
  }

  const userToUpdate = await prisma.user.findUnique({ where: { id: userId } });
  if (!userToUpdate) {
    return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  }

  if (role) {
    const decision = canChangeUserRole(user, userToUpdate, role);
    if (!decision.allowed) {
      return NextResponse.json({ error: decision.reason }, { status: 403 });
    }
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
