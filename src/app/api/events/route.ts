import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/services/authService";
import { hasAnyRole } from "@/lib/security/rbac";
import { OPERATOR_ROLES } from "@/lib/security/apiGuards";
import { enforceRateLimit, rateLimitResponseForOutcome } from "@/lib/security/rateLimit";
import { toPublicHelpRequestMapEvent, toPublicReportMapEvent } from "@/lib/security/incidentDto";

type EventSeverityKey = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

const FETCH_LIMIT = 200;

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  const canViewFull = hasAnyRole(user, OPERATOR_ROLES);

  // Same policy as GET /api/reports and GET /api/help-requests
  // (PRIV-FINAL-001 §16): this route is the map's real data source and
  // queries Report/HelpRequest directly, so it needs the same rate limit —
  // only for anonymous callers, never for authenticated operators.
  if (!user) {
    const outcome = await enforceRateLimit({ policy: "public_incident_read", request });
    const blocked = rateLimitResponseForOutcome(outcome);
    if (blocked) return blocked;
  }

  const reports = await prisma.report.findMany({
    include: { user: { select: { publicAlias: true } } },
    orderBy: { createdAt: "desc" },
    take: FETCH_LIMIT,
  });
  const helpRequests = await prisma.helpRequest.findMany({
    include: { user: { select: { publicAlias: true } } },
    orderBy: { createdAt: "desc" },
    take: FETCH_LIMIT,
  });

  if (!canViewFull) {
    const events = [
      ...reports.map(toPublicReportMapEvent).filter((event) => event !== null),
      ...helpRequests.map(toPublicHelpRequestMapEvent).filter((event) => event !== null),
    ];
    return NextResponse.json({ events });
  }

  const events = [
    ...reports.map((report) => ({
      id: report.id,
      title: report.title,
      category: report.category,
      description: report.description,
      latitude: report.latitude,
      longitude: report.longitude,
      locationText: report.locationText,
      severity: report.severity,
      type: "REPORT",
      status: report.status,
      aiSummary: report.aiSummary,
      aiRecommendation: report.aiRecommendation,
      aiConfidence: report.aiConfidence,
      falseReportRisk: report.falseReportRisk,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
      author: report.user.publicAlias,
      authorId: report.userId,
      recordType: "Report",
      priority: null,
      restrictedMode: false,
    })),
    ...helpRequests.map((request) => ({
      id: request.id,
      title: request.title,
      category: request.category,
      description: request.description,
      latitude: request.latitude,
      longitude: request.longitude,
      locationText: request.locationText,
      severity: request.priority as EventSeverityKey,
      priority: request.priority,
      type: "SOS",
      status: request.status,
      restrictedMode: request.restrictedMode,
      aiSummary: request.aiSummary,
      aiRecommendation: request.aiRecommendation,
      aiConfidence: request.aiConfidence,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      author: request.user.publicAlias,
      authorId: request.userId,
      recordType: "HelpRequest",
    })),
  ];

  const response = NextResponse.json({ events });
  // Never let a CDN/browser cache the full operator view of PII-bearing rows.
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
