import { NextRequest, NextResponse } from "next/server";
import { buildTrustProfileForUser } from "@/lib/trust/trustProfileService";
import { getCurrentUser } from "@/services/authService";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Usuario no autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const requestedUserId =
    typeof body.userId === "string" && ["ADMIN", "OPERATOR"].includes(user.role)
      ? body.userId
      : user.id;

  return NextResponse.json({
    recalculated: true,
    persisted: false,
    profile: await buildTrustProfileForUser(requestedUserId),
    notice:
      "Recalculo runtime. No modifica DB hasta definir migracion y politica RLS.",
  });
}
