import type { CriticalPoiOperationalStatus as OperationalStatusRow, CriticalPoiStatusEvidence as EvidenceRow, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  ShelterCapacityStatus,
  ShelterOperationalStatus,
  ShelterOperationalStatusReport,
  ShelterStatusEvidence,
  ShelterStatusEventType,
} from "@/lib/criticalPoi/shelterOperationalStatusTypes";

/**
 * Persistencia del estado operacional de refugios (`CriticalPoiOperationalStatus`
 * + `CriticalPoiStatusEvidence`, ver `shelterOperationalStatusTypes.ts` y la
 * migracion `202607160001_add_shelter_operational_status`). El precedence/dedup
 * de que reporte gana vive en `shelterStatusDeduplication.ts`; este modulo solo
 * lee/escribe la vista resuelta + inserta evidencia, sin decidir si conviene
 * aplicar el cambio.
 */

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined ? undefined : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue);
}

/** Umbral de "casi lleno": ocupacion >= 85% de la capacidad total. */
const NEAR_CAPACITY_RATIO = 0.85;

export function deriveCapacity(capacityTotal?: number | null, occupancyCurrent?: number | null): {
  capacityStatus: ShelterCapacityStatus;
  capacityAvailable?: number;
  occupancyPercentage?: number;
} {
  if (typeof capacityTotal !== "number" || typeof occupancyCurrent !== "number" || capacityTotal <= 0) {
    return { capacityStatus: "unknown" };
  }
  const occupancyPercentage = occupancyCurrent / capacityTotal;
  const capacityAvailable = Math.max(capacityTotal - occupancyCurrent, 0);
  const capacityStatus: ShelterCapacityStatus =
    occupancyPercentage >= 1 ? "full" : occupancyPercentage >= NEAR_CAPACITY_RATIO ? "near_capacity" : "ok";
  return { capacityStatus, capacityAvailable, occupancyPercentage };
}

function rowToShelterStatus(row: OperationalStatusRow): ShelterOperationalStatus {
  const derived = deriveCapacity(row.capacityTotal, row.occupancyCurrent);
  return {
    id: row.id,
    poiId: row.poiId,
    shelterStatus: row.shelterStatus as ShelterOperationalStatus["shelterStatus"],
    capacityStatus: derived.capacityStatus,
    capacityTotal: row.capacityTotal ?? undefined,
    occupancyCurrent: row.occupancyCurrent ?? undefined,
    capacityDeclared: row.capacityDeclared ?? undefined,
    capacityAvailable: derived.capacityAvailable,
    occupancyPercentage: derived.occupancyPercentage,
    hasWater: row.hasWater ?? undefined,
    hasElectricity: row.hasElectricity ?? undefined,
    hasFood: row.hasFood ?? undefined,
    hasMedical: row.hasMedical ?? undefined,
    hasHeating: row.hasHeating ?? undefined,
    hasBathrooms: row.hasBathrooms ?? undefined,
    hasShowers: row.hasShowers ?? undefined,
    isAccessible: row.isAccessible ?? undefined,
    allowsPets: row.allowsPets ?? undefined,
    hasConnectivity: row.hasConnectivity ?? undefined,
    operatorName: row.operatorName ?? undefined,
    contactPhone: row.contactPhone ?? undefined,
    contactNotes: row.contactNotes ?? undefined,
    operatingHours: row.operatingHours ?? undefined,
    routeStatus: (row.routeStatus as ShelterOperationalStatus["routeStatus"]) ?? undefined,
    sourceType: row.sourceType as ShelterOperationalStatus["sourceType"],
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl ?? undefined,
    sourcePublishedAt: row.sourcePublishedAt?.toISOString(),
    confidence: row.confidence,
    verificationStatus: row.verificationStatus as ShelterOperationalStatus["verificationStatus"],
    lastUpdatedAt: row.lastUpdatedAt.toISOString(),
    lastVerifiedAt: row.lastVerifiedAt?.toISOString(),
    isStale: row.isStale,
    linkedIncidentId: row.linkedIncidentId ?? undefined,
    publicationStatus: row.publicationStatus as ShelterOperationalStatus["publicationStatus"],
    createdAt: row.createdAt.toISOString(),
  };
}

function rowToEvidence(row: EvidenceRow): ShelterStatusEvidence {
  return {
    id: row.id,
    poiId: row.poiId,
    eventType: row.eventType as ShelterStatusEventType,
    sourceType: row.sourceType as ShelterStatusEvidence["sourceType"],
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl ?? undefined,
    sourcePublishedAt: row.sourcePublishedAt?.toISOString(),
    confidenceScore: row.confidenceScore,
    payload: (row.payloadJson as Record<string, unknown> | null) ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getOperationalStatusByPoiId(poiId: string): Promise<ShelterOperationalStatus | null> {
  const row = await prisma.criticalPoiOperationalStatus.findUnique({ where: { poiId } });
  return row ? rowToShelterStatus(row) : null;
}

export async function getOperationalStatusesByPoiIds(poiIds: string[]): Promise<Map<string, ShelterOperationalStatus>> {
  if (poiIds.length === 0) return new Map();
  const rows = await prisma.criticalPoiOperationalStatus.findMany({ where: { poiId: { in: poiIds } } });
  return new Map(rows.map((row) => [row.poiId, rowToShelterStatus(row)]));
}

export async function getStatusEvidenceForPoi(poiId: string, limit = 50): Promise<ShelterStatusEvidence[]> {
  const rows = await prisma.criticalPoiStatusEvidence.findMany({
    where: { poiId },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 200),
  });
  return rows.map(rowToEvidence);
}

/**
 * Aplica un reporte de fuente: siempre inserta una fila de evidencia (rastro
 * de procedencia completo) y solo sobreescribe la vista resuelta con las
 * claves presentes en `report` (ausencia != false/0). El llamador decide el
 * `eventType` y si corresponde aplicar el reporte (ver
 * `shouldApplyShelterReport` en `shelterStatusDeduplication.ts`).
 */
export async function applyShelterStatusReport(
  poiId: string,
  report: ShelterOperationalStatusReport,
  eventType: ShelterStatusEventType
): Promise<ShelterOperationalStatus> {
  const derived = deriveCapacity(report.capacityTotal, report.occupancyCurrent);

  const [row] = await prisma.$transaction([
    prisma.criticalPoiOperationalStatus.upsert({
      where: { poiId },
      create: {
        poiId,
        shelterStatus: report.shelterStatus ?? "unknown",
        capacityStatus: derived.capacityStatus,
        capacityTotal: report.capacityTotal,
        occupancyCurrent: report.occupancyCurrent,
        capacityDeclared: report.capacityDeclared,
        hasWater: report.hasWater,
        hasElectricity: report.hasElectricity,
        hasFood: report.hasFood,
        hasMedical: report.hasMedical,
        hasHeating: report.hasHeating,
        hasBathrooms: report.hasBathrooms,
        hasShowers: report.hasShowers,
        isAccessible: report.isAccessible,
        allowsPets: report.allowsPets,
        hasConnectivity: report.hasConnectivity,
        operatorName: report.operatorName,
        contactPhone: report.contactPhone,
        contactNotes: report.contactNotes,
        operatingHours: report.operatingHours,
        routeStatus: report.routeStatus,
        sourceType: report.sourceType,
        sourceName: report.sourceName,
        sourceUrl: report.sourceUrl,
        sourcePublishedAt: report.sourcePublishedAt ? new Date(report.sourcePublishedAt) : undefined,
        confidence: report.confidenceScore,
        verificationStatus: report.verificationStatus ?? "unverified",
        lastVerifiedAt: report.lastVerifiedAt ? new Date(report.lastVerifiedAt) : undefined,
        linkedIncidentId: report.linkedIncidentId,
        isStale: false,
      },
      update: {
        ...(report.shelterStatus !== undefined ? { shelterStatus: report.shelterStatus } : {}),
        capacityStatus: derived.capacityStatus,
        ...(report.capacityTotal !== undefined ? { capacityTotal: report.capacityTotal } : {}),
        ...(report.occupancyCurrent !== undefined ? { occupancyCurrent: report.occupancyCurrent } : {}),
        ...(report.capacityDeclared !== undefined ? { capacityDeclared: report.capacityDeclared } : {}),
        ...(report.hasWater !== undefined ? { hasWater: report.hasWater } : {}),
        ...(report.hasElectricity !== undefined ? { hasElectricity: report.hasElectricity } : {}),
        ...(report.hasFood !== undefined ? { hasFood: report.hasFood } : {}),
        ...(report.hasMedical !== undefined ? { hasMedical: report.hasMedical } : {}),
        ...(report.hasHeating !== undefined ? { hasHeating: report.hasHeating } : {}),
        ...(report.hasBathrooms !== undefined ? { hasBathrooms: report.hasBathrooms } : {}),
        ...(report.hasShowers !== undefined ? { hasShowers: report.hasShowers } : {}),
        ...(report.isAccessible !== undefined ? { isAccessible: report.isAccessible } : {}),
        ...(report.allowsPets !== undefined ? { allowsPets: report.allowsPets } : {}),
        ...(report.hasConnectivity !== undefined ? { hasConnectivity: report.hasConnectivity } : {}),
        ...(report.operatorName !== undefined ? { operatorName: report.operatorName } : {}),
        ...(report.contactPhone !== undefined ? { contactPhone: report.contactPhone } : {}),
        ...(report.contactNotes !== undefined ? { contactNotes: report.contactNotes } : {}),
        ...(report.operatingHours !== undefined ? { operatingHours: report.operatingHours } : {}),
        ...(report.routeStatus !== undefined ? { routeStatus: report.routeStatus } : {}),
        sourceType: report.sourceType,
        sourceName: report.sourceName,
        ...(report.sourceUrl !== undefined ? { sourceUrl: report.sourceUrl } : {}),
        ...(report.sourcePublishedAt !== undefined ? { sourcePublishedAt: new Date(report.sourcePublishedAt) } : {}),
        confidence: report.confidenceScore,
        ...(report.verificationStatus !== undefined ? { verificationStatus: report.verificationStatus } : {}),
        ...(report.lastVerifiedAt !== undefined ? { lastVerifiedAt: new Date(report.lastVerifiedAt) } : {}),
        ...(report.linkedIncidentId !== undefined ? { linkedIncidentId: report.linkedIncidentId } : {}),
        isStale: false,
      },
    }),
    prisma.criticalPoiStatusEvidence.create({
      data: {
        poiId,
        eventType,
        sourceType: report.sourceType,
        sourceName: report.sourceName,
        sourceUrl: report.sourceUrl,
        sourcePublishedAt: report.sourcePublishedAt ? new Date(report.sourcePublishedAt) : undefined,
        confidenceScore: report.confidenceScore,
        payloadJson: toJson(report),
      },
    }),
  ]);

  return rowToShelterStatus(row);
}

/**
 * Registra un reporte de fuente en la evidencia SIN tocar la vista resuelta —
 * para cuando `shouldApplyShelterReport` (`shelterStatusDeduplication.ts`)
 * decide que el reporte entrante no tiene precedencia suficiente. La
 * procedencia queda igual trazable aunque no haya ganado.
 */
export async function recordShelterStatusEvidenceOnly(
  poiId: string,
  report: ShelterOperationalStatusReport,
  eventType: ShelterStatusEventType
): Promise<ShelterStatusEvidence> {
  const row = await prisma.criticalPoiStatusEvidence.create({
    data: {
      poiId,
      eventType,
      sourceType: report.sourceType,
      sourceName: report.sourceName,
      sourceUrl: report.sourceUrl,
      sourcePublishedAt: report.sourcePublishedAt ? new Date(report.sourcePublishedAt) : undefined,
      confidenceScore: report.confidenceScore,
      payloadJson: toJson(report),
    },
  });
  return rowToEvidence(row);
}
