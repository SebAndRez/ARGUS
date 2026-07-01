import { NextResponse } from "next/server";
import { buildApiProtectionHeaders } from "@/lib/security/securityHeaders";

const allowedSurfaces = new Set([
  "ARGUS_COMMAND",
  "ARGUS_API",
  "ARGUS_DATA",
  "AURA_PRO",
  "FENIX_TWIN",
]);

function cleanString(value: unknown, maxLength: number) {
  return String(value ?? "")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, maxLength);
}

function emailLooksValid(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const organizationName = cleanString(body.organizationName, 120);
    const contactName = cleanString(body.contactName, 80);
    const contactEmail = cleanString(body.contactEmail, 120).toLowerCase();
    const useCase = cleanString(body.useCase, 800);
    const requestedSurface = cleanString(body.requestedSurface, 60);
    const country = cleanString(body.country, 80);
    const notes = cleanString(body.notes, 800);

    if (!organizationName || !contactName || !emailLooksValid(contactEmail) || !useCase) {
      return NextResponse.json(
        { accepted: false, error: "Solicitud incompleta o email invalido." },
        { status: 400, headers: buildApiProtectionHeaders() }
      );
    }

    if (requestedSurface && !allowedSurfaces.has(requestedSurface)) {
      return NextResponse.json(
        { accepted: false, error: "Superficie solicitada no valida." },
        { status: 400, headers: buildApiProtectionHeaders() }
      );
    }

    return NextResponse.json(
      {
        accepted: true,
        message:
          "Solicitud recibida para revision. El acceso institucional/API requiere autorizacion formal.",
        request: {
          organizationName,
          contactName,
          requestedSurface: requestedSurface || "ARGUS_COMMAND",
          country,
          notesProvided: Boolean(notes),
        },
      },
      { headers: buildApiProtectionHeaders() }
    );
  } catch {
    return NextResponse.json(
      { accepted: false, error: "No se pudo procesar la solicitud." },
      { status: 400, headers: buildApiProtectionHeaders() }
    );
  }
}
