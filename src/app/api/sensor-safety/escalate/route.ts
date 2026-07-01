import { NextRequest, NextResponse } from "next/server";
import { escalateSensorSafetyCheck } from "@/lib/sensor-safety/sensorSafetyStore";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id requerido." }, { status: 400 });
  const result = escalateSensorSafetyCheck(id);
  if (!result) {
    return NextResponse.json({ error: "Check-in no encontrado." }, { status: 404 });
  }
  return NextResponse.json({
    ...result,
    notice:
      "Escalacion demo: no envia contactos reales ni servicios de emergencia.",
  });
}
