import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/services/authService";
import { logAuditEvent } from "@/services/auditService";
import { analyzeReport } from "@/services/crisisAnalysisService";

const RESTRICTED_REPORT_STATUS = ["LIMITED", "SUSPENDED", "BANNED"];
const MISSING_CATEGORY = "missing_person";

function publicMissingPerson(report: {
  id: string;
  title: string;
  description: string;
  latitude: number;
  longitude: number;
  locationText: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  user?: { publicAlias: string } | null;
}) {
  const lines = report.description.split(/\r?\n/).map((line) => line.trim());
  const pick = (prefix: string) =>
    lines.find((line) => line.toLowerCase().startsWith(prefix.toLowerCase()))
      ?.split(":")
      .slice(1)
      .join(":")
      .trim() || null;

  return {
    id: report.id,
    reportId: report.id,
    displayName: pick("Nombre/alias") ?? report.title.replace(/^Persona desaparecida:?\s*/i, ""),
    ageApprox: pick("Edad aprox."),
    lastSeenText: pick("Ultima ubicacion conocida") ?? report.locationText,
    lastSeenAt: pick("Hora aprox."),
    status:
      report.status === "RESOLVED"
        ? "found"
        : report.status === "DISCARDED"
          ? "unknown"
          : "needs_verification",
    verificationStatus: report.status,
    latitude: report.latitude,
    longitude: report.longitude,
    source: "citizen_report",
    publicReporter: report.user?.publicAlias ?? "Ciudadania",
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
  };
}

function includesFilter(value: string | null | undefined, query: string | null) {
  if (!query) return true;
  return (value ?? "").toLowerCase().includes(query.toLowerCase());
}

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name")?.trim() || null;
  const status = request.nextUrl.searchParams.get("status")?.trim() || null;
  const lastSeen = request.nextUrl.searchParams.get("lastSeen")?.trim() || null;
  const limit = Math.min(
    Math.max(Number(request.nextUrl.searchParams.get("limit") ?? 50), 1),
    100
  );

  const reports = await prisma.report.findMany({
    where: { category: MISSING_CATEGORY },
    include: { user: { select: { publicAlias: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const missingPersons = reports
    .map(publicMissingPerson)
    .filter((item) => includesFilter(item.displayName, name))
    .filter((item) => includesFilter(item.lastSeenText, lastSeen))
    .filter((item) => (status ? item.status === status : true));

  return NextResponse.json({
    count: missingPersons.length,
    missingPersons,
  });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Usuario no autenticado." }, { status: 401 });
  }

  if (RESTRICTED_REPORT_STATUS.includes(user.accountStatus)) {
    return NextResponse.json(
      { error: "Cuenta restringida: no puede crear reportes normales." },
      { status: 403 }
    );
  }

  const body = await request.json();
  const displayName = String(body.displayName ?? "").trim();
  const ageApprox = String(body.ageApprox ?? "").trim();
  const lastSeenText = String(body.lastSeenText ?? body.locationText ?? "").trim();
  const lastSeenAt = String(body.lastSeenAt ?? "").trim();
  const relatedEventType = String(body.relatedEventType ?? "unknown").trim();
  const notes = String(body.notes ?? "").trim();
  const latitude = Number(body.lastSeenLat ?? body.latitude);
  const longitude = Number(body.lastSeenLng ?? body.longitude);

  if (!lastSeenText || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return NextResponse.json(
      { error: "Ultima ubicacion y coordenadas son requeridas." },
      { status: 400 }
    );
  }

  const title = `Persona desaparecida${displayName ? `: ${displayName}` : ""}`;
  const description = [
    notes,
    displayName ? `Nombre/alias: ${displayName}` : null,
    ageApprox ? `Edad aprox.: ${ageApprox}` : null,
    `Ultima ubicacion conocida: ${lastSeenText}`,
    lastSeenAt ? `Hora aprox.: ${lastSeenAt}` : null,
    "Estado: needs_verification",
    `Evento relacionado: ${relatedEventType}`,
  ]
    .filter(Boolean)
    .join("\n");
  const analysis = analyzeReport(title, description, MISSING_CATEGORY);

  const report = await prisma.report.create({
    data: {
      userId: user.id,
      category: MISSING_CATEGORY,
      title,
      description,
      latitude,
      longitude,
      locationText: lastSeenText,
      severity: analysis.severity === "LOW" ? "MEDIUM" : analysis.severity,
      status: "UNDER_REVIEW",
      aiSummary: analysis.aiSummary,
      aiRecommendation:
        "Registrar datos minimos, validar con fuentes locales y coordinar busqueda/rescate si coincide con evento activo.",
      aiConfidence: Math.min(analysis.aiConfidence, 72),
      falseReportRisk: analysis.falseReportRisk,
    },
  });

  await logAuditEvent({
    actorUserId: user.id,
    action: "CREATE_MISSING_PERSON_REPORT",
    targetType: "Report",
    targetId: report.id,
    metadata: {
      category: MISSING_CATEGORY,
      relatedEventType,
      locationText: lastSeenText,
    },
  });

  return NextResponse.json({ missingPerson: publicMissingPerson(report) });
}
