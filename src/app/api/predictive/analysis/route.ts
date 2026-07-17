import { NextRequest, NextResponse } from "next/server";
import { getPredictiveAnalyses } from "@/lib/predictive-core/predictiveFeed";
import { getCurrentUser } from "@/services/authService";
import { hasAnyRole } from "@/lib/security/rbac";
import { OPERATOR_ROLES } from "@/lib/security/apiGuards";
import { enforceRateLimit, rateLimitResponseForOutcome } from "@/lib/security/rateLimit";

export const dynamic = "force-dynamic";

/**
 * SEC-NEW-001 fix: esta ruta consultaba `Report`/`HelpRequest` a través de
 * `predictiveFeed.ts` sin pasar por el mismo contrato de redacción que ya
 * protege `/api/reports`/`/api/help-requests`/`/api/events` — reabría la
 * misma fuga de PRIV-FINAL-001 en una superficie distinta. Mismo patrón
 * exacto que esas rutas: operador+ ve datos completos, cualquier otro
 * llamador (incluida ausencia total de sesión) recibe la proyección
 * redactada de `incidentDto.ts` (vía `audience: "public"` en
 * `predictiveFeed.ts`) y queda sujeto a `public_incident_read`.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  const canViewFull = hasAnyRole(user, OPERATOR_ROLES);

  if (!user) {
    const outcome = await enforceRateLimit({ policy: "public_incident_read", request });
    const blocked = rateLimitResponseForOutcome(outcome);
    if (blocked) return blocked;
  }

  const analyses = await getPredictiveAnalyses({
    inputId: request.nextUrl.searchParams.get("inputId"),
    kind: request.nextUrl.searchParams.get("kind"),
    limit: request.nextUrl.searchParams.get("limit"),
    audience: canViewFull ? "operator" : "public",
  });

  const response = NextResponse.json({ analyses });
  if (canViewFull) {
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
}
