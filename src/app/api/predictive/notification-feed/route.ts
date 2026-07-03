import { NextRequest, NextResponse } from "next/server";
import { getPredictiveNotificationPackets } from "@/lib/predictive-core/predictiveFeed";

export const dynamic = "force-dynamic";

function severityIsCritical(severity: string) {
  return severity === "P0_CRITICAL" || severity === "P1_HIGH";
}

export async function GET(request: NextRequest) {
  const packets = await getPredictiveNotificationPackets({
    limit: request.nextUrl.searchParams.get("limit"),
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

  return NextResponse.json({
    notifications,
    summary: {
      total: notifications.length,
      critical: notifications.filter((item) => severityIsCritical(item.severity)).length,
      nearby: notifications.filter((item) => item.mapFocus).length,
      latestAt: notifications[0]?.updatedAt ?? null,
    },
  });
}
