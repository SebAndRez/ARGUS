import { NextRequest, NextResponse } from "next/server";
import { escalateSafetyCheck } from "@/lib/mobile-safety/mobileSafetyService";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";

  if (!id) {
    return NextResponse.json({ error: "id requerido." }, { status: 400 });
  }

  const check = escalateSafetyCheck(id, body.reason);
  if (!check) {
    return NextResponse.json({ error: "Safety check no encontrado." }, { status: 404 });
  }

  return NextResponse.json({
    escalated: true,
    check,
    notice:
      "Escalamiento demo. No envia contactos reales ni activa servicios de emergencia.",
  });
}
