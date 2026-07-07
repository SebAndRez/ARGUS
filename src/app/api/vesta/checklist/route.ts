import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/services/authService";
import { prisma } from "@/lib/prisma";
import { getOrCreateVestaProfile } from "@/modules/vesta/vestaProfileStore";
import { VESTA_CATEGORY_ORDER } from "@/modules/vesta/data";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Usuario no autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const category = String(body.category ?? "");
  const label = String(body.label ?? "").trim();

  if (!VESTA_CATEGORY_ORDER.includes(category as (typeof VESTA_CATEGORY_ORDER)[number])) {
    return NextResponse.json({ error: "Categoría inválida." }, { status: 400 });
  }
  if (!label) {
    return NextResponse.json({ error: "El ítem requiere una etiqueta." }, { status: 400 });
  }

  const profile = await getOrCreateVestaProfile(user.id);
  const item = await prisma.preparednessChecklistItem.create({
    data: { profileId: profile.id, category, label, isCustom: true },
  });

  return NextResponse.json({
    id: item.id,
    category: item.category,
    label: item.label,
    status: item.status,
    isCustom: item.isCustom,
    notes: item.notes,
    expiresAt: item.expiresAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  });
}
