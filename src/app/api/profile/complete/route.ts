import { NextResponse } from "next/server";
import { hashGovId } from "@/lib/identity/accountIdentityPolicy";
import {
  normalizeDocument,
  validateDocument,
} from "@/lib/identity/countryDocumentRules";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/services/authService";
import { logAuditEvent } from "@/services/auditService";

function validateAlias(alias: string) {
  if (alias.length < 3 || alias.length > 32) {
    return "El alias debe tener entre 3 y 32 caracteres.";
  }
  if (!/^[\p{L}\p{N}_-]+$/u.test(alias)) {
    return "El alias sólo puede usar letras, números, guion y underscore.";
  }
  return null;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const publicAlias = String(body.publicAlias || "").trim();
  const countryCode = String(body.countryCode || "").trim().toUpperCase();
  const city = String(body.city || "").trim();
  const region = String(body.region || "").trim();
  const documentValue = String(body.document || body.governmentId || "").trim();
  const termsAccepted = Boolean(body.termsAccepted);
  const privacyAccepted = Boolean(body.privacyAccepted);

  const aliasError = validateAlias(publicAlias);
  if (aliasError) return NextResponse.json({ error: aliasError }, { status: 400 });
  if (!countryCode || countryCode.length !== 2) {
    return NextResponse.json({ error: "Seleccione un país válido." }, { status: 400 });
  }
  if (!city) {
    return NextResponse.json({ error: "Ciudad o comuna requerida." }, { status: 400 });
  }
  if (!termsAccepted || !privacyAccepted) {
    return NextResponse.json({ error: "Debe aceptar términos y privacidad." }, { status: 400 });
  }

  const documentValidation = validateDocument(countryCode, documentValue);
  if (!documentValidation.valid) {
    return NextResponse.json({ error: documentValidation.reason }, { status: 400 });
  }

  const normalizedDocument = normalizeDocument(countryCode, documentValue);
  const governmentIdHash = hashGovId(`${countryCode}:${normalizedDocument}`);
  const existingDocument = await prisma.user.findFirst({
    where: {
      governmentIdHash,
      NOT: { id: user.id },
    },
    select: { id: true },
  });
  if (existingDocument) {
    return NextResponse.json({
      error:
        "Este documento ya está asociado a una cuenta ARGUS. Inicia sesión con el correo asociado o solicita cambio de correo desde recuperación de cuenta.",
    }, { status: 409 });
  }

  const existingAlias = await prisma.user.findFirst({
    where: {
      publicAlias,
      NOT: { id: user.id },
    },
    select: { id: true },
  });
  if (existingAlias) {
    return NextResponse.json({
      error: "Este alias ya está en uso. Prueba agregando números o guion bajo.",
    }, { status: 409 });
  }

  const now = new Date();
  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      publicAlias,
      countryCode,
      city,
      region: region || null,
      governmentIdHash,
      termsAcceptedAt: user.termsAcceptedAt ?? now,
      privacyAcceptedAt: user.privacyAcceptedAt ?? now,
      profileCompletedAt: now,
    },
  });

  await logAuditEvent({
    actorUserId: user.id,
    action: "PROFILE_COMPLETE",
    targetType: "User",
    targetId: user.id,
    metadata: { countryCode, publicAlias },
  });

  return NextResponse.json({
    ok: true,
    user: {
      id: updatedUser.id,
      publicAlias: updatedUser.publicAlias,
      countryCode: updatedUser.countryCode,
      city: updatedUser.city,
      region: updatedUser.region,
      profileCompletedAt: updatedUser.profileCompletedAt,
    },
  });
}
