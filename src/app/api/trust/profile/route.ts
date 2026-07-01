import { NextResponse } from "next/server";
import { buildTrustProfileForUser } from "@/lib/trust/trustProfileService";
import { getCurrentUser } from "@/services/authService";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      {
        error: "Usuario no autenticado.",
        demo: await buildTrustProfileForUser(null),
      },
      { status: 401 }
    );
  }

  return NextResponse.json({
    profile: await buildTrustProfileForUser(user.id),
  });
}
