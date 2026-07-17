import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/services/auditService";
import { requireTelecomConnectivityWriter } from "@/lib/security/apiGuards";
import { canConfirmOfficialConnectivityStatus } from "@/lib/security/rbac";
import {
  ROAMING_TYPES,
  NETWORK_STATES,
  TELECOM_VERIFICATION_STATUSES,
  TELECOM_SOURCE_TYPES,
  TELECOM_POI_CATEGORIES,
  REJECTED_ROAMING_TYPE,
  buildRegionKey,
  deriveRegionalEventType,
  isConflictingUpdate,
  shouldApplyConflictingUpdate,
  type TelecomRoamingType,
  type TelecomNetworkState,
  type TelecomVerificationStatus,
  type TelecomSourceType,
  type TelecomPoiCategory,
} from "@/lib/connectivity/telecomConnectivityService";

/**
 * Ingesta manual/validada de conectividad de emergencia (ARGUS v1.0.3.6 §2):
 * SUBTEL y las operadoras publican activaciones de roaming/cortes solo como
 * comunicados de prensa, sin API/RSS/CAP estructurado confirmado - por eso
 * esta es la unica via de ingesta esta pasada (ver notas en
 * `argusSourceRegistry.ts`, id "telecom_connectivity_manual"). Nunca se
 * asume "official" solo por venir de este endpoint: verificationStatus
 * "official" requiere ademas `canConfirmOfficialConnectivityStatus`.
 */

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseDate(value: unknown): Date | null {
  if (!isNonEmptyString(value)) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function validateSourceFields(body: Record<string, unknown>): { error: string } | null {
  const sourceType = body.sourceType;
  if (!isNonEmptyString(sourceType) || !(TELECOM_SOURCE_TYPES as readonly string[]).includes(sourceType)) {
    return { error: `sourceType invalido. Valores permitidos: ${TELECOM_SOURCE_TYPES.join(", ")}.` };
  }
  if (!isNonEmptyString(body.sourceName)) {
    return { error: "sourceName es requerido." };
  }
  if (sourceType !== "argus_estimate") {
    if (!isNonEmptyString(body.sourceUrl)) {
      return { error: "sourceUrl es requerido salvo para sourceType=argus_estimate." };
    }
    if (!parseDate(body.sourcePublishedAt)) {
      return { error: "sourcePublishedAt es requerido (fecha valida) salvo para sourceType=argus_estimate." };
    }
  }
  return null;
}

async function handleRegionalStatus(
  body: Record<string, unknown>,
  actor: { id: string; role?: string | null }
) {
  const sourceError = validateSourceFields(body);
  if (sourceError) return NextResponse.json(sourceError, { status: 400 });

  const roamingType = body.roamingType;
  if (roamingType === REJECTED_ROAMING_TYPE) {
    return NextResponse.json(
      { error: "roaming_internacional no es un estado valido de conectividad de emergencia nacional - es un servicio comercial distinto." },
      { status: 400 }
    );
  }
  if (!isNonEmptyString(roamingType) || !(ROAMING_TYPES as readonly string[]).includes(roamingType)) {
    return NextResponse.json({ error: `roamingType invalido. Valores permitidos: ${ROAMING_TYPES.join(", ")}.` }, { status: 400 });
  }

  const networkState = body.networkState;
  if (!isNonEmptyString(networkState) || !(NETWORK_STATES as readonly string[]).includes(networkState)) {
    return NextResponse.json({ error: `networkState invalido. Valores permitidos: ${NETWORK_STATES.join(", ")}.` }, { status: 400 });
  }

  const adminLevel1 = body.adminLevel1;
  if (!isNonEmptyString(adminLevel1)) {
    return NextResponse.json({ error: "adminLevel1 (region) es requerido." }, { status: 400 });
  }
  const adminLevel2 = isNonEmptyString(body.adminLevel2) ? body.adminLevel2.trim() : null;
  const countryCode = isNonEmptyString(body.countryCode) ? body.countryCode.trim() : "CL";
  const carrierScope = isNonEmptyString(body.carrierScope) ? body.carrierScope.trim() : "all_carriers";

  let verificationStatus: TelecomVerificationStatus = "unverified";
  if (body.verificationStatus !== undefined) {
    if (!isNonEmptyString(body.verificationStatus) || !(TELECOM_VERIFICATION_STATUSES as readonly string[]).includes(body.verificationStatus)) {
      return NextResponse.json(
        { error: `verificationStatus invalido. Valores permitidos: ${TELECOM_VERIFICATION_STATUSES.join(", ")}.` },
        { status: 400 }
      );
    }
    verificationStatus = body.verificationStatus as TelecomVerificationStatus;
  }
  if (verificationStatus === "official" && !canConfirmOfficialConnectivityStatus(actor)) {
    return NextResponse.json(
      { error: "Solo AUTHORITY, INSTITUTIONAL_ADMIN, ADMIN o SUPER_ADMIN pueden marcar un estado como 'official'." },
      { status: 403 }
    );
  }

  const confidence = Number.isFinite(Number(body.confidence)) ? Math.max(0, Math.min(100, Number(body.confidence))) : 50;
  const startedAt = parseDate(body.startedAt);
  const endedAt = parseDate(body.endedAt);
  const now = new Date();

  const existing = await prisma.telecomConnectivityStatus.findFirst({
    where: { countryCode, adminLevel1, adminLevel2, carrierScope },
  });

  const nextSnapshot = {
    roamingType: roamingType as TelecomRoamingType,
    networkState: networkState as TelecomNetworkState,
    endedAt,
    sourceName: body.sourceName as string,
    confidence,
    lastUpdatedAt: now,
  };

  const conflicting = existing
    ? isConflictingUpdate(
        {
          roamingType: existing.roamingType,
          networkState: existing.networkState,
          endedAt: existing.endedAt,
          sourceName: existing.sourceName,
          confidence: existing.confidence,
          lastUpdatedAt: existing.lastUpdatedAt,
        },
        nextSnapshot,
        now
      )
    : false;

  const applyUpdate = existing && conflicting ? shouldApplyConflictingUpdate(
    {
      roamingType: existing.roamingType,
      networkState: existing.networkState,
      endedAt: existing.endedAt,
      sourceName: existing.sourceName,
      confidence: existing.confidence,
      lastUpdatedAt: existing.lastUpdatedAt,
    },
    nextSnapshot
  ) : true;

  const hasOtherActiveRegion = await prisma.telecomConnectivityStatus.findFirst({
    where: {
      countryCode,
      roamingType: { not: "none" },
      endedAt: null,
      NOT: { id: existing?.id },
    },
    select: { id: true },
  });

  const eventType = conflicting
    ? "conflict_detected"
    : deriveRegionalEventType(
        existing
          ? {
              roamingType: existing.roamingType,
              networkState: existing.networkState,
              endedAt: existing.endedAt,
              sourceName: existing.sourceName,
              confidence: existing.confidence,
              lastUpdatedAt: existing.lastUpdatedAt,
            }
          : null,
        { roamingType, networkState, endedAt },
        Boolean(hasOtherActiveRegion)
      );

  const writeData = {
    countryCode,
    adminLevel1,
    adminLevel2,
    carrierScope,
    roamingType,
    networkState,
    activationScope: isNonEmptyString(body.activationScope) ? body.activationScope : null,
    centroidLatitude: Number.isFinite(Number(body.centroidLatitude)) ? Number(body.centroidLatitude) : null,
    centroidLongitude: Number.isFinite(Number(body.centroidLongitude)) ? Number(body.centroidLongitude) : null,
    startedAt,
    endedAt,
    sourceType: body.sourceType as TelecomSourceType,
    sourceName: body.sourceName as string,
    sourceUrl: isNonEmptyString(body.sourceUrl) ? body.sourceUrl : null,
    sourcePublishedAt: parseDate(body.sourcePublishedAt),
    confidence,
    verificationStatus,
    lastVerifiedAt: verificationStatus === "official" || verificationStatus === "corroborated" ? now : existing?.lastVerifiedAt ?? null,
    isStale: false,
    linkedIncidentId: isNonEmptyString(body.linkedIncidentId) ? body.linkedIncidentId : null,
  };

  const regionKey = buildRegionKey({ countryCode, adminLevel1, adminLevel2, carrierScope });

  const [status] = await prisma.$transaction([
    applyUpdate
      ? existing
        ? prisma.telecomConnectivityStatus.update({ where: { id: existing.id }, data: writeData })
        : prisma.telecomConnectivityStatus.create({ data: writeData })
      : prisma.telecomConnectivityStatus.findUniqueOrThrow({ where: { id: existing!.id } }),
    prisma.telecomConnectivityEvidence.create({
      data: {
        subjectType: "region",
        regionKey,
        eventType,
        sourceType: body.sourceType as string,
        sourceName: body.sourceName as string,
        sourceUrl: isNonEmptyString(body.sourceUrl) ? body.sourceUrl : null,
        sourcePublishedAt: parseDate(body.sourcePublishedAt),
        confidenceScore: confidence,
        payloadJson: {
          roamingType,
          networkState,
          applied: applyUpdate,
          ...(conflicting ? { conflictWithSource: existing?.sourceName } : {}),
        },
      },
    }),
  ]);

  await logAuditEvent({
    actorUserId: actor.id,
    action: "TELECOM_CONNECTIVITY_UPDATE",
    targetType: "TelecomConnectivityStatus",
    targetId: status.id,
    metadata: { regionKey, eventType, applied: applyUpdate, verificationStatus },
  });

  return NextResponse.json({ status, evidenceEventType: eventType, applied: applyUpdate });
}

async function handleConnectivityPoint(body: Record<string, unknown>, actor: { id: string; role?: string | null }) {
  const sourceError = validateSourceFields(body);
  if (sourceError) return NextResponse.json(sourceError, { status: 400 });

  const category = body.category;
  if (!isNonEmptyString(category) || !(TELECOM_POI_CATEGORIES as readonly string[]).includes(category)) {
    return NextResponse.json({ error: `category invalido. Valores permitidos: ${TELECOM_POI_CATEGORIES.join(", ")}.` }, { status: 400 });
  }
  if (!isNonEmptyString(body.name)) {
    return NextResponse.json({ error: "name es requerido." }, { status: 400 });
  }
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return NextResponse.json({ error: "latitude/longitude son requeridos y deben ser numericos." }, { status: 400 });
  }

  const confidence = Number.isFinite(Number(body.confidence)) ? Math.max(0, Math.min(100, Number(body.confidence))) : 50;
  const now = new Date();
  const externalId = isNonEmptyString(body.externalId) ? body.externalId : `${category as TelecomPoiCategory}-${latitude.toFixed(5)}-${longitude.toFixed(5)}`;

  const poi = await prisma.criticalPoi.upsert({
    where: { source_externalId: { source: "manual", externalId } },
    create: {
      externalId,
      source: "manual",
      name: body.name as string,
      category: category as string,
      priority: "P3",
      latitude,
      longitude,
      countryCode: isNonEmptyString(body.countryCode) ? body.countryCode : "CL",
      adminLevel1: isNonEmptyString(body.adminLevel1) ? body.adminLevel1 : null,
      adminLevel2: isNonEmptyString(body.adminLevel2) ? body.adminLevel2 : null,
      status: "active",
      confidence,
      lastSeenAt: now,
      lastVerifiedAt: now,
      tagsJson: (body.tags as object) ?? null,
      sourceUrl: isNonEmptyString(body.sourceUrl) ? body.sourceUrl : null,
      isPersistent: true,
      isVisibleByDefault: true,
    },
    update: {
      name: body.name as string,
      latitude,
      longitude,
      confidence,
      lastSeenAt: now,
      lastVerifiedAt: now,
      tagsJson: (body.tags as object) ?? undefined,
      sourceUrl: isNonEmptyString(body.sourceUrl) ? body.sourceUrl : undefined,
      status: "active",
    },
  });

  const evidence = await prisma.telecomConnectivityEvidence.create({
    data: {
      subjectType: "poi",
      poiId: poi.id,
      eventType: "point_added",
      sourceType: body.sourceType as string,
      sourceName: body.sourceName as string,
      sourceUrl: isNonEmptyString(body.sourceUrl) ? body.sourceUrl : null,
      sourcePublishedAt: parseDate(body.sourcePublishedAt),
      confidenceScore: confidence,
      payloadJson: { category },
    },
  });

  await logAuditEvent({
    actorUserId: actor.id,
    action: "TELECOM_CONNECTIVITY_UPDATE",
    targetType: "CriticalPoi",
    targetId: poi.id,
    metadata: { category, evidenceId: evidence.id },
  });

  return NextResponse.json({ status: poi, evidenceId: evidence.id });
}

export async function POST(req: Request) {
  const { user, response } = await requireTelecomConnectivityWriter();
  if (response || !user) return response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la solicitud invalido (JSON esperado)." }, { status: 400 });
  }

  const kind = body.kind;
  if (kind === "regional_status") return handleRegionalStatus(body, user);
  if (kind === "connectivity_point") return handleConnectivityPoint(body, user);
  return NextResponse.json({ error: "kind invalido. Valores permitidos: regional_status, connectivity_point." }, { status: 400 });
}
