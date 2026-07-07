import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/services/authService";
import { prisma } from "@/lib/prisma";
import { getOrCreateVestaProfile } from "@/modules/vesta/vestaProfileStore";
import { nextReminderDueDate } from "@/modules/vesta/vestaReminders";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Usuario no autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const title = String(body.title ?? "").trim();
  if (!title) {
    return NextResponse.json({ error: "El recordatorio requiere un título." }, { status: 400 });
  }
  const frequencyDays = Number.isFinite(Number(body.frequencyDays)) ? Number(body.frequencyDays) : null;

  const profile = await getOrCreateVestaProfile(user.id);
  const reminder = await prisma.preparednessReminder.create({
    data: {
      profileId: profile.id,
      type: "custom",
      title,
      dueAt: body.dueAt ? new Date(body.dueAt) : nextReminderDueDate(frequencyDays),
      frequencyDays,
    },
  });

  return NextResponse.json({
    id: reminder.id,
    type: reminder.type,
    title: reminder.title,
    dueAt: reminder.dueAt.toISOString(),
    frequencyDays: reminder.frequencyDays,
    status: reminder.status,
    lastCompletedAt: reminder.lastCompletedAt?.toISOString() ?? null,
  });
}
