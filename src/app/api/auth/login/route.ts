import { NextResponse } from "next/server";
import { verifyPassword } from "@/lib/auth/passwordService";
import { requiresProfileCompletion } from "@/lib/identity/accountIdentityPolicy";
import { prisma } from "@/lib/prisma";
import { createLoginResponse } from "@/services/authService";
import { logAuditEvent } from "@/services/auditService";

export async function POST(req: Request) {
  const body = await req.json();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const nextPath = typeof body.next === "string" && body.next.startsWith("/") ? body.next : "/app";
  if (!email) {
    return NextResponse.json({ error: "Correo requerido." }, { status: 400 });
  }
  if (!password) {
    return NextResponse.json({ error: "Contraseña requerida." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json({ error: "Credenciales inválidas." }, { status: 401 });
  }
  if (!user.passwordHash) {
    const message = user.googleSub
      ? "Esta cuenta fue creada con Google. Entra con Google o configura contraseña desde perfil."
      : "Esta cuenta local aún no tiene contraseña configurada. Usa recuperación de cuenta cuando esté disponible.";
    return NextResponse.json({ error: message }, { status: 409 });
  }
  if (!verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: "Credenciales inválidas." }, { status: 401 });
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
    next: requiresProfileCompletion(user) ? `/onboarding?next=${encodeURIComponent(nextPath)}` : nextPath,
  });
}
