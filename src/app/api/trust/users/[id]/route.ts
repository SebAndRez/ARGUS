import { NextRequest, NextResponse } from "next/server";
import {
  buildTrustProfileForUser,
  sanitizePublicTrustProfile,
} from "@/lib/trust/trustProfileService";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const profile = await buildTrustProfileForUser(id === "demo" ? null : id);

  return NextResponse.json({
    publicProfile: sanitizePublicTrustProfile(profile),
    privacy:
      "Perfil publico agregado: no expone email, RUT, datos medicos ni ubicacion privada.",
  });
}
