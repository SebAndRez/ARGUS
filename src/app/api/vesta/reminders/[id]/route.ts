import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/services/authService";
import { prisma } from "@/lib/prisma";
import { nextReminderDueDate } from "@/modules/vesta/vestaReminders";

export const dynamic = "force-dynamic";

async function loadOwnedReminder(id: string, userId: string) {
  const reminder = await prisma.preparednessReminder.findUnique({
    where: { id },
    include: { profile: { select: { userId: true } } },
  });
  if (!reminder || reminder.profile.userId !== userId) return null;
  return reminder;
}

/** action: "done" reprograma el recordatorio (o lo marca listo si no es recurrente); "skip" solo pospone. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Usuario no autenticado." }, { status: 401 });
  }

  const { id } = await params;
  const existing = await loadOwnedReminder(id, user.id);
  if (!existing) {
    return NextResponse.json({ error: "Recordatorio no encontrado." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const now = new Date();

  const updated = await prisma.preparednessReminder.update({
    where: { id },
    data:
      body.action === "skip"
        ? { dueAt: nextReminderDueDate(existing.frequencyDays, now) }
        : {
            status: existing.frequencyDays ? "pending" : "done",
            lastCompletedAt: now,
            dueAt: existing.frequencyDays ? nextReminderDueDate(existing.frequencyDays, now) : existing.dueAt,
          },
  });

  return NextResponse.json({
    id: updated.id,
    type: updated.type,
    title: updated.title,
    dueAt: updated.dueAt.toISOString(),
    frequencyDays: updated.frequencyDays,
    status: updated.status,
    lastCompletedAt: updated.lastCompletedAt?.toISOString() ?? null,
  });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Usuario no autenticado." }, { status: 401 });
  }

  const { id } = await params;
  const existing = await loadOwnedReminder(id, user.id);
  if (!existing) {
    return NextResponse.json({ error: "Recordatorio no encontrado." }, { status: 404 });
  }

  await prisma.preparednessReminder.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
