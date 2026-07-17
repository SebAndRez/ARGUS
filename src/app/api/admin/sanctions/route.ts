import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/services/auditService";
import { requireOperator } from "@/lib/security/apiGuards";
import { canChangeAccountStatus } from "@/lib/security/rbac";

/**
 * Sanction types that actually change `User.accountStatus`. `WARNING` is
 * the only type that does not — it just leaves a `Sanction` record and an
 * audit trail, so it stays reachable at the `requireOperator()` floor
 * (OPERATOR/ANALYST). Every other type mutates account access and must go
 * through the canonical `canChangeAccountStatus` policy (ADMIN+, no
 * self-target, no touching a SUPER_ADMIN unless the actor is one) — the
 * same policy `src/app/api/users/[id]/route.ts` already uses, so there is
 * one authorization rule for this action, not two.
 */
const ACCOUNT_STATUS_BY_SANCTION_TYPE: Record<string, string | null> = {
  WARNING: null,
  RESTORE: "ACTIVE",
  LIMITATION: "LIMITED",
  SUSPENSION: "SUSPENDED",
  BAN: "BANNED",
};

export async function POST(req: Request) {
  const { user, response } = await requireOperator();
  if (response || !user) return response;

  const body = await req.json();
  const userId = String(body.userId || "").trim();
  const type = String(body.type || "").trim();
  const reason = String(body.reason || "").trim();

  if (!userId || !type || !reason) {
    return NextResponse.json({ error: "userId, type y reason son requeridos." }, { status: 400 });
  }

  if (!(type in ACCOUNT_STATUS_BY_SANCTION_TYPE)) {
    return NextResponse.json({ error: "type invalido." }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) {
    return NextResponse.json({ error: "Usuario objetivo no encontrado." }, { status: 404 });
  }

  const nextAccountStatus = ACCOUNT_STATUS_BY_SANCTION_TYPE[type];
  if (nextAccountStatus !== null) {
    const decision = canChangeAccountStatus(user, target);
    if (!decision.allowed) {
      return NextResponse.json({ error: decision.reason }, { status: 403 });
    }
  }

  const sanction = await prisma.sanction.create({
    data: {
      userId,
      type,
      reason,
      createdById: user.id,
    },
  });

  if (nextAccountStatus !== null) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        accountStatus: nextAccountStatus,
        strikes: type === "RESTORE" ? 0 : undefined,
      },
    });
  }

  await logAuditEvent({
    actorUserId: user.id,
    action: `SANCTION_${type}`,
    targetType: "User",
    targetId: userId,
    metadata: { reason, previousAccountStatus: target.accountStatus, newAccountStatus: nextAccountStatus ?? target.accountStatus },
  });

  return NextResponse.json({ sanction });
}
