import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type EventSeverityKey = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export async function GET() {
  const reports = await prisma.report.findMany({
    include: { user: { select: { publicAlias: true } } },
    orderBy: { createdAt: "desc" },
  });
  const helpRequests = await prisma.helpRequest.findMany({
    include: { user: { select: { publicAlias: true } } },
    orderBy: { createdAt: "desc" },
  });

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

  return NextResponse.json({ events });
}
