/**
 * ARGUS — capa canónica de lectura (Fase B,
 * `docs/architecture/ARGUS_INCIDENT_MIGRATION_PLAN.md` §2).
 *
 * Produce, en tiempo de consulta y sin escribir nada, una vista unificada
 * de "todos los incidentes conocidos": `KnowledgeIncident` proyectado vía el
 * mapeador canónico único (Fase A, `canonicalKnowledgeIncidentToArgusEvent`)
 * más `Report`/`HelpRequest` correlacionados espacio-temporalmente contra
 * esos incidentes (diseño §7.2, regla de reportes ciudadanos: proximidad
 * ≤500m, ventana ≤6h).
 *
 * No persiste nada, no crea un segundo `Incident`, no fusiona `Report`ni
 * `HelpRequest` en el incidente: un match de correlación se reporta como
 * "señal ciudadana correlacionada con el incidente X", nunca se reescribe
 * el incidente ni se copian sus datos sensibles a él (diseño §13, §18).
 * Cuando no hay match, la señal se reporta como no correlacionada — el
 * candidato a un futuro `Incident(verificationStatus: UNVERIFIED)` que la
 * Fase C podría materializar, no materializado aquí.
 *
 * Expuesto detrás del flag `CANONICAL_READ_LAYER_ENABLED` en
 * `GET /api/incidents-canonical-preview` (interno, gated a operador) — ver
 * `docs/architecture/ARGUS_CANONICAL_READ_LAYER_IMPLEMENTATION.md`.
 */

import { prisma } from "@/lib/prisma";
import { canonicalKnowledgeIncidentToArgusEvent } from "@/lib/canonical/canonicalKnowledgeIncidentToArgusEvent";
import { isIncidentOperationallyActive } from "@/lib/lifecycle/operationalVisibilityPolicy";
import { toOperatorReport, toOperatorHelpRequest, type OperatorReport, type OperatorHelpRequest } from "@/lib/security/incidentDto";
import type { ArgusEvent, ArgusGeometry } from "@/types/argusEvent";

/** Diseño §7.2 — regla de correlación para reportes ciudadanos. */
const CITIZEN_CORRELATION_RADIUS_KM = 0.5;
const CITIZEN_CORRELATION_WINDOW_HOURS = 6;

const MAX_FETCH_ROWS = 800;
const MAX_CITIZEN_ROWS = 400;

export type CanonicalCitizenRecordType = "Report" | "HelpRequest";

export type CorrelatedCitizenSignal = {
  recordType: CanonicalCitizenRecordType;
  record: OperatorReport | OperatorHelpRequest;
  incidentId: string;
  distanceKm: number;
  hoursDelta: number;
};

export type UncorrelatedCitizenSignal = {
  recordType: CanonicalCitizenRecordType;
  record: OperatorReport | OperatorHelpRequest;
};

export type CanonicalIncidentPreviewOptions = {
  since: Date;
  /** Reloj inyectado explícitamente — nunca se lee `Date.now()` internamente. */
  now: Date;
  includeDemo: boolean;
  limit: number;
};

export type CanonicalIncidentPreviewResult = {
  generatedAt: string;
  windowSince: string;
  incidents: ArgusEvent[];
  correlatedCitizenSignals: CorrelatedCitizenSignal[];
  uncorrelatedCitizenSignals: UncorrelatedCitizenSignal[];
};

/**
 * Distancia haversine en km. Utilidad geométrica genérica (no lógica de
 * dedup/correlación de incidentes) — `distanceKm` de
 * `src/lib/ingestion/correlateExternalEvents.ts` está acoplada al tipo
 * `ArgusNormalizedEvent` y no aplica aquí sin un adaptador forzado.
 */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const EARTH_RADIUS_KM = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, h)));
}

/**
 * Punto representativo de una geometría `ArgusEvent` para fines de
 * correlación por proximidad — nunca deriva un punto de un bbox (el tipo
 * `ArgusGeometry` no tiene esa variante).
 */
export function representativePoint(geometry: ArgusGeometry): { lat: number; lng: number } | null {
  switch (geometry.type) {
    case "point":
      return { lat: geometry.coordinates[0], lng: geometry.coordinates[1] };
    case "polygon":
    case "route":
      return geometry.coordinates[0] ? { lat: geometry.coordinates[0][0], lng: geometry.coordinates[0][1] } : null;
    case "region_reference":
    case "administrative_area":
      return { lat: geometry.anchor[0], lng: geometry.anchor[1] };
    default:
      return null;
  }
}

function idPrefixFor(sourceId: string): string {
  return sourceId === "senapred_eventos" ? "chile-alert" : "vigia";
}

async function fetchMappedIncidents(since: Date, now: Date, includeDemo: boolean): Promise<ArgusEvent[]> {
  const rows = await prisma.knowledgeIncident.findMany({
    where: { updatedAt: { gte: since }, latitude: { not: null }, longitude: { not: null } },
    orderBy: [{ updatedAt: "desc" }],
    take: MAX_FETCH_ROWS,
  });

  return rows
    .map((row) => canonicalKnowledgeIncidentToArgusEvent(row, { idPrefix: idPrefixFor(row.sourceId) }))
    .filter((event): event is ArgusEvent => Boolean(event))
    .filter((event) => isIncidentOperationallyActive({ lifecycle: event.status, expiresAt: event.validUntil ?? null, now }))
    .filter((event) => includeDemo || !event.isDemo);
}

/** Mejor match (más cercano en distancia) dentro de radio + ventana — o `null` si ninguno califica. */
function correlateCitizenRecord(
  point: { lat: number; lng: number },
  createdAt: Date,
  incidents: ArgusEvent[]
): { incidentId: string; distanceKm: number; hoursDelta: number } | null {
  let best: { incidentId: string; distanceKm: number; hoursDelta: number } | null = null;

  for (const incident of incidents) {
    const incidentPoint = representativePoint(incident.geometry);
    if (!incidentPoint) continue;

    const distance = haversineKm(point, incidentPoint);
    if (distance > CITIZEN_CORRELATION_RADIUS_KM) continue;

    const incidentTime = new Date(incident.detectedAt).getTime();
    if (Number.isNaN(incidentTime)) continue;
    const hoursDelta = Math.abs(createdAt.getTime() - incidentTime) / (60 * 60 * 1000);
    if (hoursDelta > CITIZEN_CORRELATION_WINDOW_HOURS) continue;

    if (!best || distance < best.distanceKm) {
      best = { incidentId: incident.id, distanceKm: distance, hoursDelta };
    }
  }

  return best;
}

export async function buildCanonicalIncidentPreview(
  options: CanonicalIncidentPreviewOptions
): Promise<CanonicalIncidentPreviewResult> {
  const { since, now, includeDemo, limit } = options;

  const [incidents, reports, helpRequests] = await Promise.all([
    fetchMappedIncidents(since, now, includeDemo),
    prisma.report.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: MAX_CITIZEN_ROWS,
      include: { user: { select: { publicAlias: true } } },
    }),
    prisma.helpRequest.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: MAX_CITIZEN_ROWS,
      include: { user: { select: { publicAlias: true } } },
    }),
  ]);

  const limitedIncidents = incidents.slice(0, limit);

  const correlatedCitizenSignals: CorrelatedCitizenSignal[] = [];
  const uncorrelatedCitizenSignals: UncorrelatedCitizenSignal[] = [];

  for (const report of reports) {
    const match = correlateCitizenRecord({ lat: report.latitude, lng: report.longitude }, report.createdAt, limitedIncidents);
    // Vista de operador (no pública): este endpoint está gateado a
    // OPERATOR+ (ver la ruta), reutiliza el DTO ya existente de PRIV-FINAL-001
    // en vez de serializar la fila Prisma cruda o inventar una tercera forma.
    const record = toOperatorReport(report as unknown as Record<string, unknown>);
    if (match) {
      correlatedCitizenSignals.push({ recordType: "Report", record, ...match });
    } else {
      uncorrelatedCitizenSignals.push({ recordType: "Report", record });
    }
  }

  for (const helpRequest of helpRequests) {
    const match = correlateCitizenRecord(
      { lat: helpRequest.latitude, lng: helpRequest.longitude },
      helpRequest.createdAt,
      limitedIncidents
    );
    const record = toOperatorHelpRequest(helpRequest as unknown as Record<string, unknown>);
    if (match) {
      correlatedCitizenSignals.push({ recordType: "HelpRequest", record, ...match });
    } else {
      uncorrelatedCitizenSignals.push({ recordType: "HelpRequest", record });
    }
  }

  return {
    generatedAt: now.toISOString(),
    windowSince: since.toISOString(),
    incidents: limitedIncidents,
    correlatedCitizenSignals,
    uncorrelatedCitizenSignals,
  };
}
