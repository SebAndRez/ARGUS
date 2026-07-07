import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/services/authService";
import { prisma } from "@/lib/prisma";
import { getOrCreateVestaProfile } from "@/modules/vesta/vestaProfileStore";

export const dynamic = "force-dynamic";

interface ContactInput {
  name: string;
  relationship?: string | null;
  phone?: string | null;
  email?: string | null;
  priority?: number;
}

function sanitizeContacts(value: unknown): ContactInput[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item, index) => ({
      name: String(item.name ?? "").trim(),
      relationship: item.relationship ? String(item.relationship) : null,
      phone: item.phone ? String(item.phone) : null,
      email: item.email ? String(item.email) : null,
      priority: Number.isFinite(Number(item.priority)) ? Number(item.priority) : index + 1,
    }))
    .filter((contact) => contact.name.length > 0)
    .slice(0, 20);
}

/** Reemplaza toda la lista de contactos de emergencia del usuario (form-save simple, sin CRUD por id). */
export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Usuario no autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const contacts = sanitizeContacts(body.contacts);
  const profile = await getOrCreateVestaProfile(user.id);

  await prisma.$transaction([
    prisma.emergencyContact.deleteMany({ where: { profileId: profile.id } }),
    prisma.emergencyContact.createMany({
      data: contacts.map((contact) => ({ ...contact, profileId: profile.id })),
    }),
  ]);

  const updated = await prisma.emergencyContact.findMany({
    where: { profileId: profile.id },
    orderBy: { priority: "asc" },
  });

  return NextResponse.json({
    contacts: updated.map((contact) => ({
      id: contact.id,
      name: contact.name,
      relationship: contact.relationship,
      phone: contact.phone,
      email: contact.email,
      priority: contact.priority,
    })),
  });
}
