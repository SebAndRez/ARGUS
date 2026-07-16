import { NextResponse } from "next/server";
import { verifyPassword } from "@/lib/auth/passwordService";
import { requiresProfileCompletion } from "@/lib/identity/accountIdentityPolicy";
import { prisma } from "@/lib/prisma";
import { createLoginResponse } from "@/services/authService";
import { logAuditEvent } from "@/services/auditService";
import { enforceRateLimit, rateLimitResponseForOutcome } from "@/lib/security/rateLimit";
import { logOperationalEvent } from "@/lib/observability/operationalEvents";

/**
 * Order follows Prompt 12 §14 exactly: rate limit (IP layer) runs before
 * even parsing the body, then minimal validation, then the account-layer
 * rate limit (needs the email to key on), and only then password
 * verification — the costliest step never runs for an over-quota client.
 */
export async function POST(req: Request) {
  const ipRateLimit = await enforceRateLimit({ policy: "auth_login_ip", request: req });
  const ipBlocked = rateLimitResponseForOutcome(ipRateLimit);
  if (ipBlocked) return ipBlocked;

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

  const accountRateLimit = await enforceRateLimit({
    policy: "auth_login_account",
    request: req,
    identity: { accountIdentifier: email },
  });
  const accountBlocked = rateLimitResponseForOutcome(accountRateLimit);
  if (accountBlocked) return accountBlocked;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    logOperationalEvent({ event: "auth_login_failed", level: "warn", component: "security", errorCode: "UNKNOWN_ACCOUNT" });
    return NextResponse.json({ error: "Credenciales inválidas." }, { status: 401 });
  }
  if (!user.passwordHash) {
    const message = user.googleSub
      ? "Esta cuenta fue creada con Google. Entra con Google o configura contraseña desde perfil."
      : "Esta cuenta local aún no tiene contraseña configurada. Usa recuperación de cuenta cuando esté disponible.";
    return NextResponse.json({ error: message }, { status: 409 });
  }
  if (!verifyPassword(password, user.passwordHash)) {
    logOperationalEvent({ event: "auth_login_failed", level: "warn", component: "security", errorCode: "BAD_PASSWORD" });
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
