import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/services/authService";
import { prisma } from "@/lib/prisma";
import { getOrCreateVestaProfile } from "@/modules/vesta/vestaProfileStore";
import type { VestaFamilyMember } from "@/modules/vesta/types";

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export const dynamic = "force-dynamic";

function sanitizeMembers(value: unknown): VestaFamilyMember[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      name: String(item.name ?? "").trim(),
      relationship: item.relationship ? String(item.relationship) : undefined,
      isDependent: Boolean(item.isDependent),
      medicalNotes: item.medicalNotes ? String(item.medicalNotes) : undefined,
    }))
    .filter((member) => member.name.length > 0)
    .slice(0, 30);
}

function textOrNull(value: unknown) {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Usuario no autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const profile = await getOrCreateVestaProfile(user.id);

  const plan = await prisma.familyPlan.upsert({
    where: { profileId: profile.id },
    create: {
      profileId: profile.id,
      membersJson: asJson(sanitizeMembers(body.members)),
      primaryMeetingPoint: textOrNull(body.primaryMeetingPoint) ?? null,
      alternateMeetingPoint: textOrNull(body.alternateMeetingPoint) ?? null,
      evacuationRouteNotes: textOrNull(body.evacuationRouteNotes) ?? null,
      medicalNeedsNotes: textOrNull(body.medicalNeedsNotes) ?? null,
      petsNotes: textOrNull(body.petsNotes) ?? null,
      observations: textOrNull(body.observations) ?? null,
    },
    update: {
      membersJson: asJson(sanitizeMembers(body.members)),
      primaryMeetingPoint: textOrNull(body.primaryMeetingPoint),
      alternateMeetingPoint: textOrNull(body.alternateMeetingPoint),
      evacuationRouteNotes: textOrNull(body.evacuationRouteNotes),
      medicalNeedsNotes: textOrNull(body.medicalNeedsNotes),
      petsNotes: textOrNull(body.petsNotes),
      observations: textOrNull(body.observations),
    },
  });

  return NextResponse.json({
    members: Array.isArray(plan.membersJson) ? plan.membersJson : [],
    primaryMeetingPoint: plan.primaryMeetingPoint,
    alternateMeetingPoint: plan.alternateMeetingPoint,
    evacuationRouteNotes: plan.evacuationRouteNotes,
    medicalNeedsNotes: plan.medicalNeedsNotes,
    petsNotes: plan.petsNotes,
    observations: plan.observations,
    updatedAt: plan.updatedAt.toISOString(),
  });
}
