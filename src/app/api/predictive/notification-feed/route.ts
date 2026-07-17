import { NextRequest, NextResponse } from "next/server";
import { getPredictiveNotificationPackets } from "@/lib/predictive-core/predictiveFeed";
import { getCurrentUser } from "@/services/authService";
import { hasAnyRole } from "@/lib/security/rbac";
import { OPERATOR_ROLES } from "@/lib/security/apiGuards";
import { enforceRateLimit, rateLimitResponseForOutcome } from "@/lib/security/rateLimit";

export const dynamic = "force-dynamic";

function severityIsCritical(severity: string) {
  return severity === "P0_CRITICAL" || severity === "P1_HIGH";
}

/**
 * SEC-NEW-001 fix: además del título crudo, esta ruta reenviaba
 * `mapFocus.latitude/longitude` sin redondear (coordenada exacta del
 * `Report`/`HelpRequest` de origen) en `notifications[].lat/lng`. Mismo
 * patrón que `/api/predictive/analysis`: operador+ ve datos completos,
 * cualquier otro llamador recibe la proyección redactada.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  const canViewFull = hasAnyRole(user, OPERATOR_ROLES);

  if (!user) {
    const outcome = await enforceRateLimit({ policy: "public_incident_read", request });
    const blocked = rateLimitResponseForOutcome(outcome);
    if (blocked) return blocked;
  }

  const packets = await getPredictiveNotificationPackets({
    limit: request.nextUrl.searchParams.get("limit"),
    audience: canViewFull ? "operator" : "public",
  });
  const notifications = packets
    .filter((packet) => packet.notification)
    .map((packet) => ({
      id: `predictive-${packet.analysis.id}`,
      analysisId: packet.analysis.id,
      inputId: packet.analysis.inputId,
      title: packet.notification!.title,
      body: packet.notification!.body,
      severity: packet.notification!.severity,
      status: packet.analysis.status,
      sourceAuthority: packet.analysis.primaryMode,
      confidence: packet.analysis.confidence,
      actionUrl: packet.notification!.actionUrl,
      mapFocus: packet.mapFocus ?? null,
      createdAt: packet.analysis.createdAt,
      updatedAt: packet.analysis.updatedAt,
    }))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const response = NextResponse.json({
    notifications,
    summary: {
      total: notifications.length,
      critical: notifications.filter((item) => severityIsCritical(item.severity)).length,
      nearby: notifications.filter((item) => item.mapFocus).length,
      latestAt: notifications[0]?.updatedAt ?? null,
    },
  });
  if (canViewFull) {
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
}
