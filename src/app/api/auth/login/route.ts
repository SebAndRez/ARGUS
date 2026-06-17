import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createLoginResponse } from "@/services/authService";
import { logAuditEvent } from "@/services/auditService";

export async function POST(req: Request) {
  const body = await req.json();
  const email = String(body.email || "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Email requerido." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  }

  await logAuditEvent({
    actorUserId: user.id,
    action: "LOGIN",
    targetType: "User",
    targetId: user.id,
    metadata: { email },
  });

  return createLoginResponse({
    userId: user.id,
    email: user.email,
    publicAlias: user.publicAlias,
    role: user.role,
    accountStatus: user.accountStatus,
  });
}
