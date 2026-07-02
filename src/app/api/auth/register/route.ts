import { NextResponse } from "next/server";
import { hashPassword, validatePasswordStrength } from "@/lib/auth/passwordService";
import { prisma } from "@/lib/prisma";
import {
  buildDuplicateIdentityMessage,
  hashGovId,
} from "@/lib/identity/accountIdentityPolicy";
import {
  normalizeDocument,
  validateDocument,
} from "@/lib/identity/countryDocumentRules";
import { createLoginResponse } from "@/services/authService";
import { logAuditEvent } from "@/services/auditService";

export async function POST(req: Request) {
  const body = await req.json();
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const phone = String(body.phone || "").trim();
  const publicAlias = String(body.publicAlias || body.alias || name || "").trim();
  const countryCode = String(body.countryCode || "CL").trim().toUpperCase();
  const governmentId = String(body.governmentId || body.document || "").trim();
  const password = String(body.password || "");
  const confirmPassword = String(body.confirmPassword || "");
  const termsAccepted = Boolean(body.termsAccepted);
  const privacyAccepted = Boolean(body.privacyAccepted);

  if (!name || !email || !governmentId || !publicAlias || !countryCode) {
    return NextResponse.json({ error: "Nombre, email, alias, país y documento son requeridos." }, { status: 400 });
  }
  if (!password) return NextResponse.json({ error: "Contraseña requerida." }, { status: 400 });
  if (password !== confirmPassword) {
    return NextResponse.json({ error: "La confirmación de contraseña no coincide." }, { status: 400 });
  }
  const passwordValidation = validatePasswordStrength(password);
  if (!passwordValidation.valid) {
    return NextResponse.json({ error: passwordValidation.reason }, { status: 400 });
  }
  if (!termsAccepted || !privacyAccepted) {
    return NextResponse.json({ error: "Debe aceptar términos y privacidad." }, { status: 400 });
  }
  if (publicAlias.length < 3 || publicAlias.length > 32 || !/^[\p{L}\p{N}_-]+$/u.test(publicAlias)) {
    return NextResponse.json({ error: "Alias inválido. Use 3-32 caracteres, letras, números, guion o underscore." }, { status: 400 });
  }
  const documentValidation = validateDocument(countryCode, governmentId);
  if (!documentValidation.valid) {
    return NextResponse.json({ error: documentValidation.reason }, { status: 400 });
  }

  const normalizedDocument = normalizeDocument(countryCode, governmentId);
  const governmentIdHash = hashGovId(`${countryCode}:${normalizedDocument}`);
  const existingEmail = await prisma.user.findUnique({ where: { email } });
  if (existingEmail) {
    return NextResponse.json({ error: "Este correo ya está asociado a una cuenta ARGUS." }, { status: 409 });
  }

  const existingGovernmentId = await prisma.user.findUnique({
    where: { governmentIdHash },
  });
  if (existingGovernmentId) {
    return NextResponse.json({ error: buildDuplicateIdentityMessage() }, { status: 409 });
  }
  const existingAlias = await prisma.user.findFirst({ where: { publicAlias } });
  if (existingAlias) {
    return NextResponse.json({ error: "Este alias ya está en uso. Prueba otro." }, { status: 409 });
  }

  const now = new Date();
  const user = await prisma.user.create({
    data: {
      name,
      email,
      phone: phone || null,
      governmentIdHash,
      passwordHash: hashPassword(password),
      countryCode,
      publicAlias,
      role: "CITIZEN",
      accountStatus: "ACTIVE",
      termsAcceptedAt: now,
      privacyAcceptedAt: now,
      profileCompletedAt: now,
    },
  });

  await logAuditEvent({
    actorUserId: user.id,
    action: "REGISTER",
    targetType: "User",
    targetId: user.id,
    metadata: { email, publicAlias },
  });

  return createLoginResponse({
    userId: user.id,
    email: user.email,
    publicAlias: user.publicAlias,
    role: user.role,
    accountStatus: user.accountStatus,
    next: "/app",
  });
}
