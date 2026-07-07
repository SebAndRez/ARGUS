import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/services/authService";
import { logAuditEvent } from "@/services/auditService";
import { prisma } from "@/lib/prisma";
import { getOrCreateVestaProfile, toVestaProfileSummary } from "@/modules/vesta/vestaProfileStore";
import { inferNearbyRiskContexts } from "@/modules/vesta/vestaTalosServerBridge";
import type { VestaThreatType } from "@/modules/vesta/types";

export const dynamic = "force-dynamic";

function parseCoordinate(value: string | null) {
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Usuario no autenticado." }, { status: 401 });
  }

  const lat = parseCoordinate(request.nextUrl.searchParams.get("lat"));
  const lng = parseCoordinate(request.nextUrl.searchParams.get("lng"));

  const profile = await getOrCreateVestaProfile(user.id);
  let inferredRiskContexts: VestaThreatType[] = [];
  if (lat !== null && lng !== null) {
    try {
      inferredRiskContexts = await inferNearbyRiskContexts(lat, lng);
    } catch {
      inferredRiskContexts = [];
    }
  }

  return NextResponse.json(toVestaProfileSummary(profile, inferredRiskContexts));
}

export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Usuario no autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const profile = await getOrCreateVestaProfile(user.id);

  const data: { lastFullReviewAt?: Date; riskContextsJson?: string[] } = {};
  if (body.markReviewComplete === true) {
    data.lastFullReviewAt = new Date();
  }
  if (Array.isArray(body.riskContexts)) {
    data.riskContextsJson = body.riskContexts.filter((value: unknown) => typeof value === "string");
  }

  const updated = await prisma.preparednessProfile.update({
    where: { id: profile.id },
    data,
  });

  if (body.markReviewComplete === true) {
    await logAuditEvent({
      actorUserId: user.id,
      action: "VESTA_MARK_REVIEW_COMPLETE",
      targetType: "PreparednessProfile",
      targetId: profile.id,
    });
  }

  return NextResponse.json({ lastFullReviewAt: updated.lastFullReviewAt?.toISOString() ?? null });
}
