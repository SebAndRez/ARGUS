import { NextResponse } from "next/server";
import { countries, getCountryName } from "@/data/countries";
import { getDefaultUnitSystem } from "@/lib/units/unitSystem";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/services/authService";
import { logAuditEvent } from "@/services/auditService";

function sanitizeProfile(user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) {
  const locale = user.preferredLanguage ?? "es";
  return {
    id: user.id,
    email: user.email,
    publicAlias: user.publicAlias,
    displayName: user.name,
    countryCode: user.countryCode,
    countryName: user.countryCode ? getCountryName(user.countryCode, locale) : null,
    city: user.city,
    region: user.region,
    preferredLanguage: user.preferredLanguage ?? "es",
    unitSystem: user.unitSystem ?? getDefaultUnitSystem(locale, user.countryCode),
    documentRegistered: Boolean(user.governmentIdHash),
    termsAcceptedAt: user.termsAcceptedAt?.toISOString() ?? null,
    privacyAcceptedAt: user.privacyAcceptedAt?.toISOString() ?? null,
    profileCompletedAt: user.profileCompletedAt?.toISOString() ?? null,
    role: user.role,
    accountStatus: user.accountStatus,
    trustScore: user.trustScore,
    strikes: user.strikes,
  };
}

function validateAlias(alias: string) {
  if (alias.length < 3 || alias.length > 32) return false;
  return /^[\p{L}\p{N}_-]+$/u.test(alias);
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  return NextResponse.json({ profile: sanitizeProfile(user) });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const data: {
    publicAlias?: string;
    name?: string;
    countryCode?: string | null;
    city?: string | null;
    region?: string | null;
    preferredLanguage?: string | null;
    unitSystem?: string | null;
  } = {};

  if (typeof body.publicAlias === "string") {
    const publicAlias = body.publicAlias.trim();
    if (!validateAlias(publicAlias)) {
      return NextResponse.json({ error: "Alias inválido." }, { status: 400 });
    }
    const existingAlias = await prisma.user.findFirst({
      where: { publicAlias, NOT: { id: user.id } },
      select: { id: true },
    });
    if (existingAlias) {
      return NextResponse.json({ error: "Este alias ya está en uso." }, { status: 409 });
    }
    data.publicAlias = publicAlias;
  }

  if (typeof body.displayName === "string") {
    const displayName = body.displayName.trim();
    if (displayName.length < 2 || displayName.length > 80) {
      return NextResponse.json({ error: "Nombre visible inválido." }, { status: 400 });
    }
    data.name = displayName;
  }

  if (typeof body.countryCode === "string") {
    const countryCode = body.countryCode.trim().toUpperCase();
    if (!countries.some((country) => country.code === countryCode)) {
      return NextResponse.json({ error: "País inválido." }, { status: 400 });
    }
    data.countryCode = countryCode;
  }
  if (typeof body.city === "string") data.city = body.city.trim() || null;
  if (typeof body.region === "string") data.region = body.region.trim() || null;
  if (typeof body.language === "string") data.preferredLanguage = body.language.trim().slice(0, 8);
  if (typeof body.unitSystem === "string") {
    const unitSystem = body.unitSystem.trim().toUpperCase();
    if (!["METRIC", "US_CUSTOMARY", "IMPERIAL"].includes(unitSystem)) {
      return NextResponse.json({ error: "Sistema de unidades inválido." }, { status: 400 });
    }
    data.unitSystem = unitSystem;
  }

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data,
  });

  await logAuditEvent({
    actorUserId: user.id,
    action: "PROFILE_UPDATE",
    targetType: "User",
    targetId: user.id,
    metadata: { fields: Object.keys(data) },
  });

  return NextResponse.json({ profile: sanitizeProfile(updatedUser) });
}
