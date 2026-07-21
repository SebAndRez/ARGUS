import { NextResponse } from "next/server";
import { getCriticalPoiById } from "@/lib/criticalPoi/criticalPoiPersistenceService";
import {
  applyShelterStatusReport,
  getOperationalStatusByPoiId,
  getStatusEvidenceForPoi,
  recordShelterStatusEvidenceOnly,
} from "@/lib/criticalPoi/shelterOperationalStatusService";
import { inferShelterEventType, shouldApplyShelterReport } from "@/lib/criticalPoi/shelterStatusDeduplication";
import {
  DEFAULT_CONFIDENCE_BY_SOURCE_TYPE,
  SHELTER_ROUTE_STATUS_VALUES,
  SHELTER_SOURCE_TYPE_VALUES,
  SHELTER_STATUS_VALUES,
  SHELTER_VERIFICATION_STATUS_VALUES,
  toPublicShelterOperationalStatus,
  toPublicShelterStatusEvidence,
  type ShelterOperationalStatusReport,
} from "@/lib/criticalPoi/shelterOperationalStatusTypes";
import { requireOperator } from "@/lib/security/apiGuards";
import { enforceRateLimit, rateLimitResponseForOutcome } from "@/lib/security/rateLimit";
import { logAuditEvent } from "@/services/auditService";

/**
 * Escritura de estado operacional de un refugio (`CriticalPoi` categoria
 * "shelter"): capacidad, ocupacion, servicios, ruta, procedencia. Endpoint
 * protegido — sin API publica confirmada para SENAPRED/municipalidades (spec
 * ARGUS v1.0.3.4 §8), esta es la via primaria de datos oficiales en
 * produccion, ingresada por un operador autorizado (spec §7, §19). Nunca
 * acepta campos ausentes como `false`/`0` — solo se escriben las claves
 * presentes en el body (ver `ShelterOperationalStatusReport`).
 */

type RouteContext = { params: Promise<{ id: string }> };

const MIN_CAPACITY = 0;
const MAX_CAPACITY = 200_000; // cota de sanidad, no un limite real de ningun recinto conocido

function parseBoundedInt(
  value: unknown,
  field: string,
  errors: string[],
  bounds: { min: number; max: number } = { min: MIN_CAPACITY, max: MAX_CAPACITY }
): number | undefined {
  if (value === undefined) return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < bounds.min || parsed > bounds.max) {
    errors.push(`${field} debe ser un entero entre ${bounds.min} y ${bounds.max}.`);
    return undefined;
  }
  return parsed;
}

function parseOptionalBoolean(value: unknown, field: string, errors: string[]): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    errors.push(`${field} debe ser boolean.`);
    return undefined;
  }
  return value;
}

function parseOptionalString(value: unknown, field: string, maxLength: number, errors: string[]): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > maxLength) {
    errors.push(`${field} debe ser texto de hasta ${maxLength} caracteres.`);
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseOptionalIsoDate(value: unknown, field: string, errors: string[]): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !Number.isFinite(new Date(value).getTime())) {
    errors.push(`${field} debe ser una fecha ISO valida.`);
    return undefined;
  }
  return value;
}

function parseEnum<T extends string>(value: unknown, allowed: readonly T[], field: string, errors: string[]): T | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    errors.push(`${field} invalido. Valores permitidos: ${allowed.join(", ")}.`);
    return undefined;
  }
  return value as T;
}

/** Valida y arma el reporte de fuente a partir del body crudo. `errors` acumula todos los problemas de una vez (no falla al primero) para que el operador corrija todo en una sola vuelta. */
function parseShelterStatusReport(body: Record<string, unknown>): { report?: ShelterOperationalStatusReport; errors: string[] } {
  const errors: string[] = [];

  const sourceType = parseEnum(body.sourceType, SHELTER_SOURCE_TYPE_VALUES, "sourceType", errors);
  const sourceName = parseOptionalString(body.sourceName, "sourceName", 200, errors);
  if (!sourceType) errors.push("sourceType es requerido.");
  if (!sourceName) errors.push("sourceName es requerido.");

  const capacityTotal = parseBoundedInt(body.capacityTotal, "capacityTotal", errors);
  const occupancyCurrent = parseBoundedInt(body.occupancyCurrent, "occupancyCurrent", errors);
  if (
    typeof capacityTotal === "number" &&
    typeof occupancyCurrent === "number" &&
    occupancyCurrent > capacityTotal
  ) {
    errors.push("occupancyCurrent no puede ser mayor que capacityTotal.");
  }

  const confidenceScore = parseBoundedInt(body.confidenceScore, "confidenceScore", errors, { min: 0, max: 100 });

  if (errors.length > 0 || !sourceType || !sourceName) return { errors };

  const report: ShelterOperationalStatusReport = {
    sourceType,
    sourceName,
    sourceUrl: parseOptionalString(body.sourceUrl, "sourceUrl", 500, errors),
    sourcePublishedAt: parseOptionalIsoDate(body.sourcePublishedAt, "sourcePublishedAt", errors),
    confidenceScore: confidenceScore ?? DEFAULT_CONFIDENCE_BY_SOURCE_TYPE[sourceType],
    shelterStatus: parseEnum(body.shelterStatus, SHELTER_STATUS_VALUES, "shelterStatus", errors),
    capacityTotal,
    occupancyCurrent,
    hasWater: parseOptionalBoolean(body.hasWater, "hasWater", errors),
    hasElectricity: parseOptionalBoolean(body.hasElectricity, "hasElectricity", errors),
    hasFood: parseOptionalBoolean(body.hasFood, "hasFood", errors),
    hasMedical: parseOptionalBoolean(body.hasMedical, "hasMedical", errors),
    hasHeating: parseOptionalBoolean(body.hasHeating, "hasHeating", errors),
    hasBathrooms: parseOptionalBoolean(body.hasBathrooms, "hasBathrooms", errors),
    hasShowers: parseOptionalBoolean(body.hasShowers, "hasShowers", errors),
    isAccessible: parseOptionalBoolean(body.isAccessible, "isAccessible", errors),
    allowsPets: parseOptionalBoolean(body.allowsPets, "allowsPets", errors),
    hasConnectivity: parseOptionalBoolean(body.hasConnectivity, "hasConnectivity", errors),
    operatorName: parseOptionalString(body.operatorName, "operatorName", 200, errors),
    contactPhone: parseOptionalString(body.contactPhone, "contactPhone", 40, errors),
    contactNotes: parseOptionalString(body.contactNotes, "contactNotes", 1000, errors),
    routeStatus: parseEnum(body.routeStatus, SHELTER_ROUTE_STATUS_VALUES, "routeStatus", errors),
    verificationStatus: parseEnum(body.verificationStatus, SHELTER_VERIFICATION_STATUS_VALUES, "verificationStatus", errors),
    lastVerifiedAt: parseOptionalIsoDate(body.lastVerifiedAt, "lastVerifiedAt", errors),
    linkedIncidentId: parseOptionalString(body.linkedIncidentId, "linkedIncidentId", 100, errors),
  };

  return errors.length > 0 ? { errors } : { report, errors: [] };
}

export async function POST(request: Request, ctx: RouteContext) {
  const { user, response: authResponse } = await requireOperator();
  if (authResponse || !user) return authResponse ?? NextResponse.json({ error: "Autenticación requerida." }, { status: 401 });

  const rateLimitOutcome = await enforceRateLimit({
    policy: "shelter_status_manual_update",
    request,
    identity: { userId: user.id },
  });
  const rateLimitedResponse = rateLimitResponseForOutcome(rateLimitOutcome);
  if (rateLimitedResponse) return rateLimitedResponse;

  const { id: poiId } = await ctx.params;

  const poi = await getCriticalPoiById(poiId);
  if (!poi) return NextResponse.json({ error: "Infraestructura crítica no encontrada." }, { status: 404 });
  if (poi.category !== "shelter") {
    return NextResponse.json({ error: "El estado operacional solo aplica a categoria 'shelter'." }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body invalido." }, { status: 400 });
  }

  const { report, errors } = parseShelterStatusReport(body);
  if (!report) return NextResponse.json({ error: "Datos invalidos.", details: errors }, { status: 400 });

  const existing = await getOperationalStatusByPoiId(poiId);
  const recentEvidence = await getStatusEvidenceForPoi(poiId, 20);
  const recentSourceNames = recentEvidence.map((evidence) => evidence.sourceName);

  const applies = shouldApplyShelterReport(existing, report, { recentSourceNames });
  const eventType = inferShelterEventType(existing, report, applies);

  const result = applies
    ? await applyShelterStatusReport(poiId, report, eventType)
    : existing!;

  if (!applies) {
    await recordShelterStatusEvidenceOnly(poiId, report, eventType);
  }

  await logAuditEvent({
    actorUserId: user.id,
    action: applies ? "SHELTER_STATUS_UPDATED" : "SHELTER_STATUS_EVIDENCE_RECORDED",
    targetType: "CriticalPoi",
    targetId: poiId,
    metadata: { eventType, applied: applies, sourceType: report.sourceType, sourceName: report.sourceName },
  });

  return NextResponse.json({ status: "ok", applied: applies, eventType, operationalStatus: result });
}

/**
 * Sin autenticacion (a diferencia del POST de arriba, que exige
 * `requireOperator()`) — por eso tanto `operationalStatus` como cada
 * `evidence[].payload` se redactan antes de responder: nunca deben salir
 * operatorName/contactPhone/contactNotes por esta via publica.
 */
export async function GET(_request: Request, ctx: RouteContext) {
  const { id: poiId } = await ctx.params;
  const poi = await getCriticalPoiById(poiId);
  if (!poi || poi.category !== "shelter") {
    return NextResponse.json({ error: "Refugio no encontrado." }, { status: 404 });
  }

  const [operationalStatus, evidence] = await Promise.all([
    getOperationalStatusByPoiId(poiId),
    getStatusEvidenceForPoi(poiId, 50),
  ]);

  return NextResponse.json({
    poi,
    operationalStatus: operationalStatus ? toPublicShelterOperationalStatus(operationalStatus) : null,
    evidence: evidence.map(toPublicShelterStatusEvidence),
  });
}
