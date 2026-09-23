import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { analyzeHelpRequest } from "@/services/crisisAnalysisService";
import { getCurrentUser } from "@/services/authService";
import { logAuditEvent } from "@/services/auditService";
import { shadowWriteAfterLegacyWrite } from "@/lib/database-target/shadow-write/legacyShadowSync";
import { observeDualRead } from "@/lib/database-target/dual-read/legacyDualRead";
import { hasAnyRole } from "@/lib/security/rbac";
import { OPERATOR_ROLES } from "@/lib/security/apiGuards";
import { toOperatorHelpRequest, toPublicHelpRequest } from "@/lib/security/incidentDto";
import { enforceRateLimit, rateLimitResponseForOutcome } from "@/lib/security/rateLimit";

const RESTRICTED_ACCOUNT = ["LIMITED", "SUSPENDED", "BANNED"];
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
  const helpRequests = await prisma.helpRequest.findMany({
    include: { user: { select: { publicAlias: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const payload = canViewFull
    ? helpRequests.map(toOperatorHelpRequest)
    : helpRequests.map(toPublicHelpRequest);

  // Dual-read (Paso 5): compares the rows just read against their target
  // counterparts. The payload above is already built from legacy and is never
  // touched; the comparison result is only logged/metric'd (field names and
  // codes, never values) and is never returned to any caller. Off by default:
  // it needs BOTH ARGUS_TARGET_DB_DUAL_READ_ENABLED and
  // ARGUS_TARGET_DB_READ_ENABLED, and it runs in a READ ONLY transaction.
  await observeDualRead(
    "HelpRequest",
    helpRequests.map((row) => row.id)
  );

  const response = NextResponse.json({ helpRequests: payload });
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

  const body = await req.json();
  const category = String(body.category || "Otro").trim();
  const title = String(body.title || "").trim();
  const description = String(body.description || "").trim();
  const priority = String(body.priority || "MEDIUM").trim() as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  const latitude = Number(body.latitude ?? 0);
  const longitude = Number(body.longitude ?? 0);
  const locationText = body.locationText ? String(body.locationText).trim() : null;

  if (!title || !description || !latitude || !longitude) {
    return NextResponse.json({ error: "Título, descripción y ubicación son requeridos." }, { status: 400 });
  }

  const analysis = analyzeHelpRequest(title, description, category);
  const restrictedMode = RESTRICTED_ACCOUNT.includes(user.accountStatus);

  const helpRequest = await prisma.helpRequest.create({
    data: {
      userId: user.id,
      category,
      title,
      description,
      latitude,
      longitude,
      locationText,
      priority,
      restrictedMode,
      aiSummary: analysis.aiSummary,
      aiRecommendation: analysis.aiRecommendation,
      aiConfidence: analysis.aiConfidence,
    },
  });

  // Metadata never carries free-text user input (title/description/location) —
  // only categorical/operational fields, per PRIV-FINAL-001 §14.
  await logAuditEvent({
    actorUserId: user.id,
    action: "CREATE_HELP_REQUEST",
    targetType: "HelpRequest",
    targetId: helpRequest.id,
    metadata: { category, restrictedMode },
  });

  // Shadow write (Paso 5): mirrors the committed legacy HelpRequest into
  // help.help_requests + help.affected_people through Wave 050's own sync
  // function. Legacy stays the source of truth; this never throws and never
  // changes the response the caller gets.
  await shadowWriteAfterLegacyWrite("HelpRequest", [helpRequest.id]);

  return NextResponse.json({ helpRequest, restrictedMode });
}
