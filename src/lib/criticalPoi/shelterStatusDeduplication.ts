import { getCriticalPoisNear } from "@/lib/criticalPoi/criticalPoiPersistenceService";
import type { CriticalPoi, CriticalPoiSource } from "@/lib/criticalPoi/criticalPoiTypes";
import {
  shelterSourceAuthorityRank,
  type ShelterOperationalStatus,
  type ShelterOperationalStatusReport,
  type ShelterStatusEventType,
} from "@/lib/criticalPoi/shelterOperationalStatusTypes";

/**
 * Deduplicacion y precedencia de reportes de refugios, mismo patron que
 * `src/lib/knowledge-intake/persistence/knowledgeDeduplication.ts` pero para
 * `CriticalPoi` (categoria "shelter") + `CriticalPoiOperationalStatus` en vez
 * de `KnowledgeIncident`. Dos publicaciones sobre el mismo recinto (por
 * SENAPRED, una municipalidad, un medio, etc.) deben resolver al mismo
 * `CriticalPoi`, no crear un marcador nuevo cada vez.
 */

function normalizeShelterName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function roundCoordinate(value?: number) {
  // 2 decimales ~ 1.1km de precision: suficiente para distinguir recintos
  // distintos sin fragmentar el mismo recinto por redondeo de GPS.
  return typeof value === "number" ? Math.round(value * 100) / 100 : null;
}

export interface ShelterCandidateReport {
  name: string;
  commune?: string;
  lat?: number;
  lng?: number;
  externalId?: string;
  source?: CriticalPoiSource;
}

export function buildShelterDedupKey(candidate: ShelterCandidateReport): string {
  return [
    normalizeShelterName(candidate.name),
    candidate.commune?.toLowerCase().trim() ?? "sin-comuna",
    roundCoordinate(candidate.lat) ?? "sin-lat",
    roundCoordinate(candidate.lng) ?? "sin-lng",
  ].join(":");
}

/**
 * Busca un `CriticalPoi` existente de categoria "shelter" que corresponda al
 * candidato: primero por `[source, externalId]` exacto, luego por
 * nombre+comuna dentro de un radio acotado (coincidencia difusa, mismo
 * espiritu que `findExistingIncident`'s bbox+titulo fallback). Sin
 * coordenadas no hay como acotar la busqueda de forma segura, asi que
 * retorna null (el llamador decide si crear una entrada nueva o pedir mas
 * datos - nunca inventar coordenadas).
 */
function findFuzzyShelterMatches(nearby: CriticalPoi[], candidate: ShelterCandidateReport): CriticalPoi[] {
  const targetName = normalizeShelterName(candidate.name);
  const targetCommune = candidate.commune?.toLowerCase().trim();

  return nearby.filter((poi) => {
    const poiName = normalizeShelterName(poi.name);
    const nameMatches = poiName === targetName || poiName.includes(targetName) || targetName.includes(poiName);
    const communeMatches = !targetCommune || !poi.city || poi.city.toLowerCase().trim() === targetCommune;
    return nameMatches && communeMatches;
  });
}

export async function findExistingShelterPoi(candidate: ShelterCandidateReport, radiusKm = 2): Promise<CriticalPoi | null> {
  if (typeof candidate.lat !== "number" || typeof candidate.lng !== "number") return null;

  const nearby = await getCriticalPoisNear({ lat: candidate.lat, lng: candidate.lng }, radiusKm, { categories: ["shelter"] });

  if (candidate.source && candidate.externalId) {
    const exact = nearby.find((poi) => poi.source === candidate.source && poi.externalId === candidate.externalId);
    if (exact) return exact;
  }

  return findFuzzyShelterMatches(nearby, candidate)[0] ?? null;
}

/**
 * Como `findExistingShelterPoi`, pero devuelve TODAS las coincidencias
 * difusas en vez de solo la primera — usado cuando el llamador necesita
 * distinguir "no hay coincidencia" de "hay mas de una posible coincidencia,
 * requiere revision" (spec ARGUS v1.0.3.5 §13: "los casos ambiguos deben
 * quedar marcados para revision", nunca fusionados automaticamente sin
 * evidencia suficiente). Nunca considera el match exacto por
 * `[source, externalId]` — ese caso siempre es inequivoco y ya lo resuelve
 * `findExistingShelterPoi`.
 */
export async function findAmbiguousShelterMatches(candidate: ShelterCandidateReport, radiusKm = 2): Promise<CriticalPoi[]> {
  if (typeof candidate.lat !== "number" || typeof candidate.lng !== "number") return [];
  const nearby = await getCriticalPoisNear({ lat: candidate.lat, lng: candidate.lng }, radiusKm, { categories: ["shelter"] });
  return findFuzzyShelterMatches(nearby, candidate);
}

export type ShelterIdentityResolution =
  | { kind: "exact"; poi: CriticalPoi }
  | { kind: "single_fuzzy"; poi: CriticalPoi }
  | { kind: "ambiguous"; candidates: CriticalPoi[] }
  | { kind: "new" };

/**
 * Resuelve la identidad de un candidato en UNA sola consulta de proximidad
 * (evita repetir `getCriticalPoisNear` para exacto + difuso por separado).
 * Usado por la sincronizacion Codigo Azul: `exact` = match confiable por
 * `[source, externalId]`; `single_fuzzy` = una unica coincidencia por
 * nombre+comuna (se trata como el mismo recinto); `ambiguous` = mas de una
 * coincidencia difusa, requiere revision humana (spec ARGUS v1.0.3.5 §13,
 * nunca fusionar automaticamente sin evidencia suficiente); `new` = ninguna
 * coincidencia, candidato a creacion.
 */
export async function resolveShelterCandidateIdentity(
  candidate: ShelterCandidateReport,
  radiusKm = 2
): Promise<ShelterIdentityResolution> {
  if (typeof candidate.lat !== "number" || typeof candidate.lng !== "number") return { kind: "new" };

  const nearby = await getCriticalPoisNear({ lat: candidate.lat, lng: candidate.lng }, radiusKm, { categories: ["shelter"] });

  if (candidate.source && candidate.externalId) {
    const exact = nearby.find((poi) => poi.source === candidate.source && poi.externalId === candidate.externalId);
    if (exact) return { kind: "exact", poi: exact };
  }

  const fuzzyMatches = findFuzzyShelterMatches(nearby, candidate);
  if (fuzzyMatches.length === 0) return { kind: "new" };
  if (fuzzyMatches.length === 1) return { kind: "single_fuzzy", poi: fuzzyMatches[0] };
  return { kind: "ambiguous", candidates: fuzzyMatches };
}

export interface ShelterPrecedenceContext {
  /** sourceName distintos vistos recientemente en la evidencia de este POI, para el criterio de "fuentes concordantes". */
  recentSourceNames?: string[];
}

/**
 * Decide si un reporte entrante debe reemplazar la vista resuelta actual.
 * Orden de precedencia (spec ARGUS v1.0.3.4 §7): autoridad de la fuente >
 * fecha de publicacion > fecha de verificacion > numero de fuentes
 * concordantes > confianza. Un reporte de menor autoridad NUNCA sobreescribe
 * uno de mayor autoridad salvo que el dato existente ya este marcado
 * `isStale` (una fuente vigente siempre gana a una vencida, sin importar
 * jerarquia). Siempre se escribe una fila de evidencia independientemente de
 * este resultado (ver `applyShelterStatusReport` en
 * `shelterOperationalStatusService.ts`) - esto solo decide si la vista
 * resuelta cambia.
 */
export function shouldApplyShelterReport(
  existing: ShelterOperationalStatus | null,
  incoming: ShelterOperationalStatusReport,
  context: ShelterPrecedenceContext = {}
): boolean {
  if (!existing) return true;
  if (existing.isStale) return true;

  const existingRank = shelterSourceAuthorityRank[existing.sourceType];
  const incomingRank = shelterSourceAuthorityRank[incoming.sourceType];
  if (incomingRank !== existingRank) return incomingRank < existingRank;

  const incomingPublished = incoming.sourcePublishedAt ? new Date(incoming.sourcePublishedAt).getTime() : NaN;
  const existingPublished = existing.sourcePublishedAt ? new Date(existing.sourcePublishedAt).getTime() : NaN;
  if (Number.isFinite(incomingPublished) && Number.isFinite(existingPublished) && incomingPublished !== existingPublished) {
    return incomingPublished > existingPublished;
  }

  const incomingVerified = incoming.lastVerifiedAt ? new Date(incoming.lastVerifiedAt).getTime() : NaN;
  const existingVerified = existing.lastVerifiedAt ? new Date(existing.lastVerifiedAt).getTime() : NaN;
  if (Number.isFinite(incomingVerified) && Number.isFinite(existingVerified) && incomingVerified !== existingVerified) {
    return incomingVerified > existingVerified;
  }

  const agreementCount = new Set([...(context.recentSourceNames ?? []), incoming.sourceName]).size;
  if (agreementCount >= 2) return true;

  if (incoming.confidenceScore !== existing.confidence) return incoming.confidenceScore > existing.confidence;

  return true;
}

/**
 * Clasifica el reporte entrante como uno de los eventos de historial del
 * spec §16, comparando contra la vista resuelta actual. No requiere que el
 * reporte tenga precedencia (`shouldApplyShelterReport`) — se usa tanto
 * cuando el reporte gana como cuando queda solo como evidencia.
 */
export function inferShelterEventType(
  existing: ShelterOperationalStatus | null,
  incoming: ShelterOperationalStatusReport,
  applied: boolean
): ShelterStatusEventType {
  if (!existing) return "created";

  if (!applied) {
    const existingRank = shelterSourceAuthorityRank[existing.sourceType];
    const incomingRank = shelterSourceAuthorityRank[incoming.sourceType];
    // Una fuente de autoridad comparable o mayor que no gano la precedencia
    // (p.ej. perdio por fecha de publicacion) es un desacuerdo real entre
    // fuentes confiables, no solo "todavia no alcanza el umbral".
    if (incomingRank <= existingRank) return "conflict_detected";
    return "source_updated";
  }

  if (incoming.shelterStatus === "full" && existing.shelterStatus !== "full") return "full";
  if (incoming.shelterStatus === "closed" && existing.shelterStatus !== "closed") return "closed";
  if (incoming.shelterStatus && incoming.shelterStatus !== "closed" && existing.shelterStatus === "closed") return "enabled";
  if (incoming.routeStatus === "blocked" && existing.routeStatus !== "blocked") return "route_blocked";
  if (incoming.routeStatus && incoming.routeStatus !== "blocked" && existing.routeStatus === "blocked") return "route_restored";
  if (
    existing.hasWater === false && incoming.hasWater === true
    || existing.hasElectricity === false && incoming.hasElectricity === true
    || existing.hasConnectivity === false && incoming.hasConnectivity === true
  ) {
    return "service_recovered";
  }
  if (incoming.occupancyCurrent !== undefined) return "occupancy_updated";
  if (incoming.capacityTotal !== undefined) return "capacity_updated";
  return "source_updated";
}
