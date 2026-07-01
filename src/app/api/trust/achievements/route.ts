import { NextResponse } from "next/server";
import { achievementDefinitions } from "@/data/achievementDefinitions";
import { buildTrustProfileForUser } from "@/lib/trust/trustProfileService";
import { getCurrentUser } from "@/services/authService";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  const profile = await buildTrustProfileForUser(user?.id ?? null);

  return NextResponse.json({
    definitions: achievementDefinitions,
    progress: profile.achievements,
    demo: !user,
    notice:
      "Los logros son cosmeticos o de apoyo. La Credibilidad ARGUS depende de evidencia y reportes confirmados.",
  });
}
