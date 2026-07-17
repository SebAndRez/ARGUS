import type { CriticalPoi } from "@/lib/criticalPoi/criticalPoiTypes";

/**
 * Estado operacional en tiempo real de un CriticalPoi de categoria "shelter"
 * (capacidad, ocupacion, servicios, ruta, procedencia). Ver
 * `prisma/schema.prisma` -> `CriticalPoiOperationalStatus` /
 * `CriticalPoiStatusEvidence` y la migracion
 * `202607160001_add_shelter_operational_status`. No inventar capacidad,
 * ocupacion ni disponibilidad: un campo ausente se representa como
 * `undefined`, nunca como `0`/`false`.
 */

export type ShelterStatus = "available" | "near_capacity" | "full" | "closed" | "compromised" | "unknown";

export type ShelterCapacityStatus = "ok" | "near_capacity" | "full" | "unknown";

export type ShelterRouteStatus = "open" | "congested" | "blocked" | "unknown";

export type ShelterSourceType = "senapred" | "codigo_azul" | "municipality" | "media" | "manual_operator" | "osm" | "argus_estimate";

export type ShelterVerificationStatus = "unverified" | "candidate" | "corroborated" | "official" | "rejected";

/** Presencia del registro en el listado de su fuente (distinto de `ShelterStatus`, que es el estado fisico). Nunca implica borrado. */
export type ShelterPublicationStatus = "active" | "missing" | "stale" | "archived";

export type ShelterStatusEventType =
  | "created"
  | "enabled"
  | "capacity_updated"
  | "occupancy_updated"
  | "full"
  | "closed"
  | "route_blocked"
  | "route_restored"
  | "service_recovered"
  | "source_updated"
  | "marked_stale"
  | "conflict_detected";

export interface ShelterOperationalStatus {
  id: string;
  poiId: string;

  shelterStatus: ShelterStatus;
  capacityStatus: ShelterCapacityStatus;

  capacityTotal?: number;
  occupancyCurrent?: number;
  /** Cifra autoreportada (p.ej. "Cupos" de Codigo Azul) sin significado administrativo confirmado. Nunca alimenta capacityStatus/capacityAvailable. */
  capacityDeclared?: number;
  /** Derivado en lectura, nunca almacenado: capacityTotal - occupancyCurrent cuando ambos existen. */
  capacityAvailable?: number;
  /** Derivado en lectura, nunca almacenado. */
  occupancyPercentage?: number;

  hasWater?: boolean;
  hasElectricity?: boolean;
  hasFood?: boolean;
  hasMedical?: boolean;
  hasHeating?: boolean;
  hasBathrooms?: boolean;
  hasShowers?: boolean;
  isAccessible?: boolean;
  allowsPets?: boolean;
  hasConnectivity?: boolean;

  operatorName?: string;
  contactPhone?: string;
  contactNotes?: string;
  /** Horario de operacion publicado tal cual (p.ej. "24 Horas"). Nunca implica disponibilidad actual. */
  operatingHours?: string;

  routeStatus?: ShelterRouteStatus;

  sourceType: ShelterSourceType;
  sourceName: string;
  sourceUrl?: string;
  sourcePublishedAt?: string;
  confidence: number;
  verificationStatus: ShelterVerificationStatus;

  lastUpdatedAt: string;
  lastVerifiedAt?: string;
  isStale: boolean;

  linkedIncidentId?: string;

  publicationStatus: ShelterPublicationStatus;

  createdAt: string;
}

export interface ShelterStatusEvidence {
  id: string;
  poiId: string;
  eventType: ShelterStatusEventType;
  sourceType: ShelterSourceType;
  sourceName: string;
  sourceUrl?: string;
  sourcePublishedAt?: string;
  confidenceScore: number;
  payload?: Record<string, unknown>;
  createdAt: string;
}

/**
 * Entrada de un reporte de fuente. Solo las claves presentes se escriben —
 * `undefined` significa "esta fuente no informa este campo", no "es falso/0".
 */
export interface ShelterOperationalStatusReport {
  shelterStatus?: ShelterStatus;
  capacityTotal?: number;
  occupancyCurrent?: number;
  capacityDeclared?: number;
  hasWater?: boolean;
  hasElectricity?: boolean;
  hasFood?: boolean;
  hasMedical?: boolean;
  hasHeating?: boolean;
  hasBathrooms?: boolean;
  hasShowers?: boolean;
  isAccessible?: boolean;
  allowsPets?: boolean;
  hasConnectivity?: boolean;
  operatorName?: string;
  contactPhone?: string;
  contactNotes?: string;
  operatingHours?: string;
  routeStatus?: ShelterRouteStatus;
  verificationStatus?: ShelterVerificationStatus;
  lastVerifiedAt?: string;
  linkedIncidentId?: string;

  sourceType: ShelterSourceType;
  sourceName: string;
  sourceUrl?: string;
  sourcePublishedAt?: string;
  confidenceScore: number;
}

export const SHELTER_STATUS_VALUES: ShelterStatus[] = ["available", "near_capacity", "full", "closed", "compromised", "unknown"];
export const SHELTER_ROUTE_STATUS_VALUES: ShelterRouteStatus[] = ["open", "congested", "blocked", "unknown"];
export const SHELTER_SOURCE_TYPE_VALUES: ShelterSourceType[] = ["senapred", "codigo_azul", "municipality", "media", "manual_operator", "osm", "argus_estimate"];
export const SHELTER_PUBLICATION_STATUS_VALUES: ShelterPublicationStatus[] = ["active", "missing", "stale", "archived"];
export const SHELTER_VERIFICATION_STATUS_VALUES: ShelterVerificationStatus[] = [
  "unverified",
  "candidate",
  "corroborated",
  "official",
  "rejected",
];

/** Confianza por defecto cuando el llamador no informa `confidenceScore` explicito, por autoridad de fuente. */
export const DEFAULT_CONFIDENCE_BY_SOURCE_TYPE: Record<ShelterSourceType, number> = {
  senapred: 90,
  codigo_azul: 75,
  municipality: 80,
  manual_operator: 70,
  media: 50,
  osm: 60,
  argus_estimate: 40,
};

/**
 * Autoridad para decidir que reporte gana en la vista resuelta (ver
 * `shouldApplyShelterReport`). Codigo Azul es el registro canonico del
 * programa ministerial (autoritativo para identidad/tipo/institucion del
 * recinto), pero SENAPRED conserva la maxima autoridad para el estado
 * operacional en tiempo real durante una emergencia declarada -- Codigo
 * Azul publica "Cupos" sin significado de disponibilidad confirmado (ver
 * `capacityDeclared`), por lo que no compite por precedencia de ocupacion
 * real contra un reporte SENAPRED/municipal.
 */
export const shelterSourceAuthorityRank: Record<ShelterSourceType, number> = {
  senapred: 0,
  codigo_azul: 1,
  municipality: 2,
  manual_operator: 3,
  media: 4,
  argus_estimate: 5,
  osm: 6,
};

/** `CriticalPoi` (categoria "shelter") + su estado operacional, para respuestas de API. `operationalStatus` ausente = sin reporte aun, nunca "cerrado"/"vacio". */
export interface CriticalPoiWithOperationalStatus extends CriticalPoi {
  operationalStatus?: ShelterOperationalStatus;
}
