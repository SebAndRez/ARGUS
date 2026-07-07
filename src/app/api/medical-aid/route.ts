import { NextRequest, NextResponse } from "next/server";
import { getNearbyMedicalPoints } from "@/data/auraMedicalPoints";
import { createDemoMedicalAidRequest } from "@/lib/medical/medicalAidEngine";
import type { MedicalAidType } from "@/types/medical";

export const dynamic = "force-dynamic";

const allowedTypes: MedicalAidType[] = [
  "need_help",
  "bleeding",
  "breathing_difficulty",
  "injury",
  "trapped",
  "other",
];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const type = body.type as MedicalAidType;
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);

    if (!allowedTypes.includes(type)) {
      return NextResponse.json({ error: "Tipo medico no valido." }, { status: 400 });
    }
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return NextResponse.json({ error: "Coordenadas invalidas." }, { status: 400 });
    }

    const nearestMedicalPoint = getNearbyMedicalPoints({ lat: latitude, lng: longitude })[0];

    return NextResponse.json({
      request: createDemoMedicalAidRequest({
        type,
        latitude,
        longitude,
        publicNote:
          typeof body.publicNote === "string"
            ? body.publicNote.slice(0, 240)
            : undefined,
        nearestMedicalPoint,
      }),
      privacy:
        "Solicitud demo. No se envia a terceros ni reemplaza atencion medica profesional.",
    });
  } catch {
    return NextResponse.json({ error: "Payload invalido." }, { status: 400 });
  }
}
