import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createLoginResponse } from "@/services/authService";
import { logAuditEvent } from "@/services/auditService";
import { generateGovernmentIdHash, formatPublicAlias } from "@/services/govIdentity/govIdentityProvider";

export async function POST(req: Request) {
  const body = await req.json();
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const phone = String(body.phone || "").trim();
  const governmentId = String(body.governmentId || "").trim();

  if (!name || !email || !governmentId) {
    return NextResponse.json({ error: "Nombre, email y documento son requeridos." }, { status: 400 });
  }

  const governmentIdHash = generateGovernmentIdHash(governmentId);
  const existingEmail = await prisma.user.findUnique({ where: { email } });
  if (existingEmail) {
    return NextResponse.json({ error: "Ya existe una cuenta con este email." }, { status: 409 });
  }

  const existingGovernmentId = await prisma.user.findUnique({
    where: { governmentIdHash },
  });
  if (existingGovernmentId) {
    return NextResponse.json({ error: "Este RUT ya esta registrado." }, { status: 409 });
  }

  const publicAlias = formatPublicAlias(name);
  const user = await prisma.user.create({
    data: {
      name,
      email,
      phone: phone || null,
      governmentIdHash,
      publicAlias,
      role: "CITIZEN",
      accountStatus: "ACTIVE",
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
  });
}
