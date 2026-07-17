import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { analyzeReport } from "@/services/crisisAnalysisService";
import { getCurrentUser } from "@/services/authService";
import { logAuditEvent } from "@/services/auditService";
import { hasAnyRole } from "@/lib/security/rbac";
import { OPERATOR_ROLES } from "@/lib/security/apiGuards";
import { toOperatorReport, toPublicReport } from "@/lib/security/incidentDto";
import { enforceRateLimit, rateLimitResponseForOutcome } from "@/lib/security/rateLimit";

const RESTRICTED_REPORT_STATUS = ["LIMITED", "SUSPENDED", "BANNED"];
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

function parseLimit(value: string | null) {
  const limit = Number(value ?? DEFAULT_LIMIT);
  return Number.isInteger(limit) ? Math.min(MAX_LIMIT, Math.max(1, limit)) : DEFAULT_LIMIT;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  const canViewFull = hasAnyRole(user, OPERATOR_ROLES);

  // Rate limiting only applies to anonymous/unauthenticated callers — an
  // authenticated operator/analyst/admin session already identifies the
  // caller and must not be throttled while refreshing the operational
  // dashboard (Prompt PRIV-FINAL-001 §16).
  if (!user) {
    const outcome = await enforceRateLimit({ policy: "public_incident_read", request });
    const blocked = rateLimitResponseForOutcome(outcome);
    if (blocked) return blocked;
  }

  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
  const reports = await prisma.report.findMany({
    include: { user: { select: { publicAlias: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const payload = canViewFull ? reports.map(toOperatorReport) : reports.map(toPublicReport);

  const response = NextResponse.json({ reports: payload });
  if (canViewFull) {
    // Never let a CDN/browser cache the full operator view of PII-bearing rows.
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Usuario no autenticado." }, { status: 401 });
  }

  if (RESTRICTED_REPORT_STATUS.includes(user.accountStatus)) {
    return NextResponse.json({ error: "Cuenta restringida: no puede crear reportes normales." }, { status: 403 });
  }

  const body = await req.json();
  const category = String(body.category || "Otro").trim();
  const title = String(body.title || "").trim();
  const description = String(body.description || "").trim();
  const latitude = Number(body.latitude ?? 0);
  const longitude = Number(body.longitude ?? 0);
  const locationText = body.locationText ? String(body.locationText).trim() : null;
  const isMissingPerson = category === "missing_person";

  if (!title || !description || !latitude || !longitude) {
    return NextResponse.json({ error: "Título, descripción y ubicación son requeridos." }, { status: 400 });
  }

  const analysis = analyzeReport(title, description, category);
  const report = await prisma.report.create({
    data: {
      userId: user.id,
      category,
      title,
      description,
      latitude,
      longitude,
      locationText,
      severity: isMissingPerson && analysis.severity === "LOW" ? "MEDIUM" : analysis.severity,
      status: isMissingPerson ? "UNDER_REVIEW" : undefined,
      aiSummary: analysis.aiSummary,
      aiRecommendation: isMissingPerson
        ? "Validar datos minimos, no exponer contacto personal y coordinar busqueda/rescate si coincide con evento activo."
        : analysis.aiRecommendation,
      aiConfidence: isMissingPerson ? Math.min(analysis.aiConfidence, 72) : analysis.aiConfidence,
      falseReportRisk: analysis.falseReportRisk,
    },
  });

  // Metadata never carries free-text user input (title/description/location) —
  // only categorical/operational fields, per PRIV-FINAL-001 §14.
  await logAuditEvent({
    actorUserId: user.id,
    action: "CREATE_REPORT",
    targetType: "Report",
    targetId: report.id,
    metadata: { category, severity: report.severity, missingPerson: isMissingPerson },
  });

  return NextResponse.json({ report });
}
