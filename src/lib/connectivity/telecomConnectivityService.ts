/**
 * Logica pura de conectividad de emergencia (ARGUS v1.0.3.6): vocabulario
 * valido, derivacion de eventType para la bitacora de evidencia, deteccion
 * de conflicto entre fuentes y vigencia. Separado de la ruta API para que
 * sea testeable sin base de datos, mismo patron que
 * `shelterStatusLifecycle.ts`/`shelterStatusDeduplication.ts`.
 */

export const ROAMING_TYPES = ["none", "roaming_automatico_nacional", "roaming_emergencia"] as const;
export type TelecomRoamingType = (typeof ROAMING_TYPES)[number];

/**
 * Roaming internacional (uso de red fuera de Chile) es un concepto comercial
 * distinto y NUNCA debe presentarse como instruccion de emergencia nacional
 * (spec ARGUS v1.0.3.6 §3). No forma parte de `ROAMING_TYPES` a proposito;
 * se deja aqui solo para que la capa de validacion pueda dar un mensaje de
 * rechazo explicito en vez de un generico "valor invalido".
 */
export const REJECTED_ROAMING_TYPE = "roaming_internacional";

export const NETWORK_STATES = ["normal", "degraded", "outage", "restored", "unknown"] as const;
export type TelecomNetworkState = (typeof NETWORK_STATES)[number];

export const TELECOM_VERIFICATION_STATUSES = ["unverified", "candidate", "corroborated", "official", "rejected"] as const;
export type TelecomVerificationStatus = (typeof TELECOM_VERIFICATION_STATUSES)[number];

export const TELECOM_SOURCE_TYPES = [
  "senapred",
  "subtel_communique",
  "carrier_communique",
  "municipality",
  "media",
  "manual_operator",
  "argus_estimate",
] as const;
export type TelecomSourceType = (typeof TELECOM_SOURCE_TYPES)[number];

export const TELECOM_POI_CATEGORIES = ["telecom_mobile_unit", "telecom_emergency_wifi", "telecom_charging_point"] as const;
export type TelecomPoiCategory = (typeof TELECOM_POI_CATEGORIES)[number];

export interface RegionKeyInput {
  countryCode: string;
  adminLevel1: string;
  adminLevel2?: string | null;
  carrierScope: string;
}

export function buildRegionKey(input: RegionKeyInput): string {
  return `${input.countryCode}:${input.adminLevel1}:${input.adminLevel2 ?? ""}:${input.carrierScope}`;
}

/** TTL unico (a diferencia de refugios, un solo campo relevante por fila: el estado combinado roaming+red). */
export const CONNECTIVITY_STALE_AFTER_HOURS = 12;

export function computeConnectivityStaleness(input: { lastUpdatedAt: Date; now?: Date }): boolean {
  const now = input.now ?? new Date();
  const hoursSinceUpdate = (now.getTime() - input.lastUpdatedAt.getTime()) / 3_600_000;
  return hoursSinceUpdate > CONNECTIVITY_STALE_AFTER_HOURS;
}

export interface ConnectivitySnapshot {
  roamingType: TelecomRoamingType | string;
  networkState: TelecomNetworkState | string;
  endedAt: Date | null;
  sourceName: string;
  confidence: number;
  lastUpdatedAt: Date;
}

export type ConnectivityEventType =
  | "activated"
  | "expanded"
  | "reduced"
  | "ended"
  | "degraded"
  | "restored"
  | "source_updated"
  | "conflict_detected";

/**
 * Deriva el eventType de bitacora comparando el estado anterior (si existe)
 * con el nuevo. `hasOtherActiveRegion` distingue una primera activacion
 * nacional ("activated") de una ampliacion a una region adicional mientras
 * la activacion ya esta vigente en otra parte ("expanded") - spec §16
 * ("Se amplie a nuevas regiones o comunas").
 */
export function deriveRegionalEventType(
  previous: ConnectivitySnapshot | null,
  next: Pick<ConnectivitySnapshot, "roamingType" | "networkState" | "endedAt">,
  hasOtherActiveRegion: boolean
): ConnectivityEventType {
  const wasActive = previous ? previous.roamingType !== "none" && !previous.endedAt : false;
  const isActive = next.roamingType !== "none" && !next.endedAt;

  if (wasActive && !isActive) return "ended";
  if (!wasActive && isActive) return hasOtherActiveRegion ? "expanded" : "activated";
  if (wasActive && isActive && previous && previous.roamingType !== "none" && next.roamingType === "none") return "reduced";

  const previousNetworkDegraded = previous ? previous.networkState === "degraded" || previous.networkState === "outage" : false;
  const nextNetworkDegraded = next.networkState === "degraded" || next.networkState === "outage";
  if (!previousNetworkDegraded && nextNetworkDegraded) return "degraded";
  if (previousNetworkDegraded && !nextNetworkDegraded) return "restored";

  return "source_updated";
}

/**
 * Dos fuentes distintas reportando estados incompatibles para la misma
 * region en una ventana corta cuentan como conflicto (spec §16: "una fuente
 * oficial contradiga a otra") en vez de sobrescribirse en silencio.
 */
export function isConflictingUpdate(previous: ConnectivitySnapshot | null, next: ConnectivitySnapshot, now: Date = new Date()): boolean {
  if (!previous) return false;
  if (previous.sourceName === next.sourceName) return false;
  const hoursSincePrevious = (now.getTime() - previous.lastUpdatedAt.getTime()) / 3_600_000;
  if (hoursSincePrevious > 6) return false;
  return previous.roamingType !== next.roamingType || previous.networkState !== next.networkState;
}

/**
 * En conflicto, la fuente de menor confianza no sobrescribe el estado
 * resuelto - solo queda registrada como evidencia contradictoria. Empate:
 * gana el registro mas reciente (next), igual que el resto de ARGUS trata
 * "misma confianza" como progreso natural del reporte mas nuevo.
 */
export function shouldApplyConflictingUpdate(previous: ConnectivitySnapshot, next: ConnectivitySnapshot): boolean {
  return next.confidence >= previous.confidence;
}
