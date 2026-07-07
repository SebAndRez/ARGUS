import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/services/authService";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const VALID_STATUSES = ["pending", "ready", "expiresSoon", "review", "notApplicable"];

async function loadOwnedItem(id: string, userId: string) {
  const item = await prisma.preparednessChecklistItem.findUnique({
    where: { id },
    include: { profile: { select: { userId: true } } },
  });
  if (!item || item.profile.userId !== userId) return null;
  return item;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Usuario no autenticado." }, { status: 401 });
  }

  const { id } = await params;
  const existing = await loadOwnedItem(id, user.id);
  if (!existing) {
    return NextResponse.json({ error: "Ítem no encontrado." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const data: { status?: string; notes?: string | null; expiresAt?: Date | null } = {};

  if (typeof body.status === "string") {
    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Estado inválido." }, { status: 400 });
    }
    data.status = body.status;
  }
  if (body.notes !== undefined) {
    data.notes = body.notes ? String(body.notes) : null;
  }
  if (body.expiresAt !== undefined) {
    data.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  }

  const updated = await prisma.preparednessChecklistItem.update({ where: { id }, data });

  return NextResponse.json({
    id: updated.id,
    category: updated.category,
    label: updated.label,
    status: updated.status,
    isCustom: updated.isCustom,
    notes: updated.notes,
    expiresAt: updated.expiresAt?.toISOString() ?? null,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Usuario no autenticado." }, { status: 401 });
  }

  const { id } = await params;
  const existing = await loadOwnedItem(id, user.id);
  if (!existing) {
    return NextResponse.json({ error: "Ítem no encontrado." }, { status: 404 });
  }
  if (!existing.isCustom) {
    return NextResponse.json({ error: "Solo se pueden eliminar ítems agregados por el usuario." }, { status: 400 });
  }

  await prisma.preparednessChecklistItem.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
