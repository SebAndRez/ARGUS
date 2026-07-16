import type { GlobalThreatType } from "@/lib/vigia/threatClassifier";
import {
  geometryProximity,
  haversineDistanceKm,
  isFiniteLatLng,
  type GeometryProximity,
  type LatLng,
  type RawGeometry,
} from "@/lib/geometry/wildfireGeometry";

/**
 * ARGUS Prompt 15 — política específica de correlación de incendios.
 *
 * Especialización del sistema canónico de identidad/deduplicación
 * (`docs/architecture/ARGUS_CANONICAL_INCIDENT_DESIGN.md` §7.2: "Incendios —
 * clustering de hotspots FIRMS/EFFIS/Copernicus EMS ... preservando la
 * ventana de agrupación existente"). No reemplaza `buildGlobalDedupKey`
 * (`src/lib/vigia/dedup.ts`) para el resto de las amenazas — solo para
 * WILDFIRE, cuya clave geo-temporal genérica (bucket de 0.25° / 24h) no
 * distingue observación satelital de perímetro institucional ni usa
 * geometría real, exactamente el vacío que este documento corrige.
 *
 * Todos los umbrales están centralizados aquí (Prompt 15 §24) — ningún otro
 * archivo de esta tarea define un umbral de distancia/tiempo/puntuación en
 * paralelo.
 */

export type WildfireSourceRole =
  | "satellite_observation" // NASA FIRMS — foco térmico, alta cadencia, sin autoridad institucional
  | "institutional_perimeter" // Copernicus EFFIS — perímetro/área quemada oficial Copernicus
  | "emergency_activation" // Copernicus EMS — activación de mapeo de emergencia, no observación primaria
  | "other"; // GDACS/EONET/ReliefWeb/SENAPRED/news clasificados WILDFIRE — regla genérica conservadora

export function wildfireSourceRole(sourceId: string): WildfireSourceRole {
  if (sourceId === "nasa_firms") return "satellite_observation";
  if (sourceId === "copernicus_effis") return "institutional_perimeter";
  if (sourceId === "copernicus_ems") return "emergency_activation";
  return "other";
}

/**
 * Perfil de correlación para incendios (Prompt 15 §8). Cada campo documenta
 * unidad, razón y a qué pares de fuentes aplica — los valores concretos por
 * par están en `WILDFIRE_PAIR_RULES` (§ abajo), este perfil es el resumen
 * conceptual y el valor por defecto para pares no catalogados ("other").
 */
export type WildfireCorrelationProfile = {
  /** Horas: ventana temporal por defecto para pares sin regla específica. Ninguna corrida de Global Watch mira más allá de 14 días (EMS), así que 96h es un techo conservador para fuentes no catalogadas. */
  temporalWindowHours: number;
  /** Km: distancia centroide-a-centroide por defecto entre dos observaciones puntuales sin regla específica. */
  pointDistanceKm: number;
  /** Km: distancia máxima para encadenar dos clusters FIRMS consecutivos como el mismo frente en expansión (§9.1). */
  clusterDistanceKm: number;
  /** 0-1: fracción de solape de área exigida entre dos polígonos para considerarlos el mismo incendio (no usado hoy: EFFIS es la única fuente con polígono real en esta tarea; documentado para cuando exista un segundo productor de polígonos). */
  polygonOverlapThreshold: number;
  /** Km: distancia máxima centroide-a-centroide cuando ninguna de las dos geometrías es polígono. */
  centroidDistanceKm: number;
  /** Si es true, dos incidentes con `region`/`admin1` conocidos y distintos nunca alcanzan el puntaje máximo administrativo (no es un bloqueo duro, ver §11). */
  regionConstraint: boolean;
  /** Si es true, dos incidentes con `country` conocidos y distintos se separan siempre (bloqueo duro — Prompt 15 §11: "incendios a ambos lados de una frontera cuando no exista continuidad"). */
  countryConstraint: boolean;
};

export const WILDFIRE_CORRELATION_PROFILE: WildfireCorrelationProfile = {
  temporalWindowHours: 96,
  pointDistanceKm: 20,
  clusterDistanceKm: 25,
  polygonOverlapThreshold: 0.1,
  centroidDistanceKm: 20,
  regionConstraint: true,
  countryConstraint: true,
};

export type WildfirePairRule = {
  label: string;
  /** Km — distancia/contorno máximo (bbox de búsqueda aparte, ver §23; esto es la decisión final, no la preselección). */
  maxDistanceKm: number;
  /** Horas — ventana temporal máxima entre las dos señales. */
  maxTemporalHours: number;
  /** 0-15 — cuánto aporta el hecho de que el par de fuentes sea uno de los catalogados explícitamente por el Prompt 15 §9. */
  sourceRelationScore: number;
  reason: string;
};

function pairKey(a: WildfireSourceRole, b: WildfireSourceRole): string {
  return [a, b].sort().join("|");
}

/**
 * Reglas por par de fuentes (Prompt 15 §9). Cada valor está calibrado contra
 * el comportamiento real de los adaptadores ya inspeccionados, no elegido
 * arbitrariamente:
 *
 * - FIRMS↔FIRMS: `firmsClusterer.ts` ya agrupa por celda de 0.2°
 *   (~22 km de diagonal en el ecuador); 25 km permite encadenar clusters de
 *   celdas contiguas (frente en expansión) sin fusionar toda una región. 72 h
 *   porque FIRMS se consulta con `days=2` — un hueco mayor a 3 días sin
 *   detección sugiere un foco nuevo, no continuidad del mismo incendio.
 * - FIRMS↔EFFIS: el radio de un pixel VIIRS (~375 m) más margen de
 *   georreferenciación se resume en 10 km cuando el punto NO cae dentro del
 *   polígono EFFIS (si cae dentro, la contención por sí sola basta — ver
 *   `evaluateWildfireCorrelation`). 120 h porque EFFIS actualiza el polígono
 *   ~2 veces al día pero el incendio puede seguir activo varios días.
 * - FIRMS↔EMS: el centroide de una activación EMS es a nivel de evento/área
 *   solicitada, no un punto preciso del fuego — 30 km es más laxo que
 *   FIRMS↔EFFIS a propósito, pero sigue siendo un radio operacional (no
 *   "todo el país"), lo que impide que una activación territorial amplia
 *   absorba cualquier hotspot de la región (Prompt 15 Caso 8). 168 h (7 días)
 *   porque una activación EMS puede solicitarse días después de la primera
 *   detección satelital.
 * - EFFIS↔EMS: 25 km desde el punto EMS al perímetro EFFIS (o contención
 *   directa) y 240 h (10 días) — dos fuentes institucionales del mismo
 *   incendio pueden desfasarse varios días entre la detección del área
 *   quemada y la solicitud de cartografía de emergencia.
 * - Cualquier otra fuente clasificada WILDFIRE (GDACS, EONET, ReliefWeb,
 *   SENAPRED, prensa): regla conservadora única, sin autoridad especial de
 *   ningún par — `sourceRelationScore` más bajo (8, no 15) porque el Prompt
 *   15 solo especificó reglas para FIRMS/EFFIS/EMS explícitamente.
 */
const WILDFIRE_PAIR_RULES: Record<string, WildfirePairRule> = {
  [pairKey("satellite_observation", "satellite_observation")]: {
    label: "FIRMS↔FIRMS",
    maxDistanceKm: 25,
    maxTemporalHours: 72,
    sourceRelationScore: 15,
    reason: "Continuidad de focos térmicos entre celdas contiguas del mismo frente.",
  },
  [pairKey("institutional_perimeter", "satellite_observation")]: {
    label: "FIRMS↔EFFIS",
    maxDistanceKm: 10,
    maxTemporalHours: 120,
    sourceRelationScore: 15,
    reason: "Foco térmico dentro o junto al perímetro quemado oficial Copernicus.",
  },
  [pairKey("emergency_activation", "satellite_observation")]: {
    label: "FIRMS↔EMS",
    maxDistanceKm: 30,
    maxTemporalHours: 168,
    sourceRelationScore: 15,
    reason: "Foco térmico dentro del radio operacional de una activación EMS de incendio.",
  },
  [pairKey("emergency_activation", "institutional_perimeter")]: {
    label: "EFFIS↔EMS",
    maxDistanceKm: 25,
    maxTemporalHours: 240,
    sourceRelationScore: 15,
    reason: "Activación de mapeo de emergencia sobre el mismo perímetro EFFIS.",
  },
};

const DEFAULT_PAIR_RULE_SCORE = 8;

function resolvePairRule(roleA: WildfireSourceRole, roleB: WildfireSourceRole): WildfirePairRule {
  const known = WILDFIRE_PAIR_RULES[pairKey(roleA, roleB)];
  if (known) return known;
  return {
    label: `${roleA}↔${roleB}`,
    maxDistanceKm: WILDFIRE_CORRELATION_PROFILE.centroidDistanceKm,
    maxTemporalHours: WILDFIRE_CORRELATION_PROFILE.temporalWindowHours,
    sourceRelationScore: DEFAULT_PAIR_RULE_SCORE,
    reason: "Par de fuentes sin regla específica del Prompt 15 §9 — umbral genérico conservador.",
  };
}

export type WildfireCorrelationCandidate = {
  /** Identificador interno del candidato (incident.id en memoria, o KnowledgeIncident.id si viene de BD). */
  id: string;
  sourceId: string;
  threat: GlobalThreatType;
  country?: string | null;
  region?: string | null;
  geometry?: RawGeometry;
  latitude?: number | null;
  longitude?: number | null;
  /** ISO 8601. Se usa `occurredAt ?? detectedAt` como referencia temporal. */
  occurredAt?: string | null;
  detectedAt?: string | null;
  /**
   * Lifecycle crudo del incidente persistido con el que se compara (ausente
   * cuando ambos lados son candidatos nuevos de la misma corrida, que todavía
   * no tienen lifecycle asignado). Ver `classifyLifecycleVisibility` — un
   * incidente terminal (resuelto/archivado/rechazado/duplicado) nunca se usa
   * como lado B de una fusión automática (Prompt 15 §16).
   */
  lifecycle?: string | null;
};

export type WildfireCorrelationDecision = "merge" | "candidate" | "separate";

export type WildfireCorrelationScoreBreakdown = {
  spatial: number;
  temporal: number;
  administrative: number;
  sourceRelation: number;
  semantic: number;
};

export type WildfireCorrelationResult = {
  decision: WildfireCorrelationDecision;
  score: number;
  breakdown: WildfireCorrelationScoreBreakdown;
  pairLabel: string;
  distanceKm: number | null;
  deltaHours: number | null;
  contained: boolean;
  reason: string;
};

/** Puntuación mínima para fusionar (adjuntar como evidencia del mismo incidente). */
export const WILDFIRE_MERGE_THRESHOLD = 65;
/** Puntuación mínima para registrar una relación candidata ambigua (se mantiene separado, se loguea). */
export const WILDFIRE_CANDIDATE_THRESHOLD = 40;

function normalizeAdminText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function parseReferenceTime(candidate: WildfireCorrelationCandidate): number | null {
  const raw = candidate.occurredAt ?? candidate.detectedAt;
  if (!raw) return null;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? time : null;
}

function resolveGeometry(candidate: WildfireCorrelationCandidate): RawGeometry {
  if (candidate.geometry && typeof candidate.geometry === "object" && "type" in candidate.geometry) {
    return candidate.geometry as RawGeometry;
  }
  if (isFiniteLatLng({ lat: candidate.latitude ?? NaN, lng: candidate.longitude ?? NaN })) {
    return { type: "Point", coordinates: [candidate.longitude as number, candidate.latitude as number] };
  }
  return undefined;
}

function resolveCentroid(candidate: WildfireCorrelationCandidate): LatLng | null {
  if (isFiniteLatLng({ lat: candidate.latitude ?? NaN, lng: candidate.longitude ?? NaN })) {
    return { lat: candidate.latitude as number, lng: candidate.longitude as number };
  }
  return null;
}

function administrativeScore(a: WildfireCorrelationCandidate, b: WildfireCorrelationCandidate): number {
  const countryA = a.country ? normalizeAdminText(a.country) : null;
  const countryB = b.country ? normalizeAdminText(b.country) : null;
  if (!countryA || !countryB) return 4; // dato insuficiente: crédito neutro, no penaliza ni premia
  if (countryA !== countryB) return 0; // en la práctica inalcanzable: el gate duro de país ya separó antes de puntuar
  const regionA = a.region ? normalizeAdminText(a.region) : null;
  const regionB = b.region ? normalizeAdminText(b.region) : null;
  if (regionA && regionB) {
    return regionA === regionB ? 15 : 8;
  }
  return 8; // mismo país, región desconocida de al menos un lado
}

/**
 * Evalúa la correlación entre dos señales de incendio. Función pura y
 * determinista (Prompt 15 §12, §26 Caso 18): mismas entradas producen
 * siempre el mismo resultado; no consulta base de datos, no hace red, no
 * lee el reloj (toda referencia temporal viene de los campos del
 * candidato).
 *
 * Orden de evaluación (gates duros primero, puntuación después — Prompt 15
 * §11, §23): amenaza, coordenadas válidas, país, lifecycle terminal,
 * distancia/contención, ventana temporal. Solo si las seis pasan se calcula
 * el puntaje ponderado (spatial+temporal+administrative+sourceRelation+
 * semantic, máximo 100) y se compara contra los umbrales.
 */
export function evaluateWildfireCorrelation(
  a: WildfireCorrelationCandidate,
  b: WildfireCorrelationCandidate
): WildfireCorrelationResult {
  const empty: WildfireCorrelationScoreBreakdown = { spatial: 0, temporal: 0, administrative: 0, sourceRelation: 0, semantic: 0 };
  const roleA = wildfireSourceRole(a.sourceId);
  const roleB = wildfireSourceRole(b.sourceId);
  const pairRule = resolvePairRule(roleA, roleB);
  const separate = (reason: string, extra: Partial<WildfireCorrelationResult> = {}): WildfireCorrelationResult => ({
    decision: "separate",
    score: 0,
    breakdown: empty,
    pairLabel: pairRule.label,
    distanceKm: null,
    deltaHours: null,
    contained: false,
    reason,
    ...extra,
  });

  if (a.threat !== "WILDFIRE" || b.threat !== "WILDFIRE") {
    return separate("not_wildfire");
  }

  // Caso 11: un incidente terminal (resuelto/archivado/rechazado/duplicado)
  // nunca absorbe una señal nueva automáticamente — requiere la transición
  // de reapertura explícita del Prompt 8 §8.2, no una fusión de correlación.
  if (b.lifecycle) {
    const normalized = b.lifecycle.toLowerCase().trim();
    if (["resolved", "archived", "rejected", "duplicate"].includes(normalized)) {
      return separate("terminal_lifecycle_requires_reopening");
    }
  }
  if (a.lifecycle) {
    const normalized = a.lifecycle.toLowerCase().trim();
    if (["resolved", "archived", "rejected", "duplicate"].includes(normalized)) {
      return separate("terminal_lifecycle_requires_reopening");
    }
  }

  const centroidA = resolveCentroid(a);
  const centroidB = resolveCentroid(b);
  if (!centroidA || !centroidB) {
    return separate("invalid_coordinates");
  }

  const countryA = a.country ? normalizeAdminText(a.country) : null;
  const countryB = b.country ? normalizeAdminText(b.country) : null;
  if (WILDFIRE_CORRELATION_PROFILE.countryConstraint && countryA && countryB && countryA !== countryB) {
    return separate("country_mismatch");
  }

  const geometryA = resolveGeometry(a);
  const geometryB = resolveGeometry(b);
  let proximity: GeometryProximity;
  try {
    proximity = geometryProximity(geometryA, geometryB);
  } catch {
    return separate("invalid_geometry");
  }
  const distanceKm = proximity.distanceKm ?? haversineDistanceKm(centroidA, centroidB);
  const contained = proximity.contained;
  if (!contained && distanceKm > pairRule.maxDistanceKm) {
    return separate("distance_exceeded", { distanceKm });
  }

  const timeA = parseReferenceTime(a);
  const timeB = parseReferenceTime(b);
  const deltaHours = timeA !== null && timeB !== null ? Math.abs(timeA - timeB) / (60 * 60 * 1000) : null;
  if (deltaHours !== null && deltaHours > pairRule.maxTemporalHours) {
    return separate("temporal_window_exceeded", { distanceKm, deltaHours });
  }

  const spatial = contained ? 40 : Math.round(40 * (1 - distanceKm / pairRule.maxDistanceKm));
  const temporal =
    deltaHours === null ? 0 : Math.round(25 * (1 - Math.min(deltaHours, pairRule.maxTemporalHours) / pairRule.maxTemporalHours));
  const administrative = administrativeScore(a, b);
  const sourceRelation = pairRule.sourceRelationScore;
  const semantic = 5;

  const score = spatial + temporal + administrative + sourceRelation + semantic;
  const decision: WildfireCorrelationDecision =
    score >= WILDFIRE_MERGE_THRESHOLD ? "merge" : score >= WILDFIRE_CANDIDATE_THRESHOLD ? "candidate" : "separate";

  return {
    decision,
    score,
    breakdown: { spatial, temporal, administrative, sourceRelation, semantic },
    pairLabel: pairRule.label,
    distanceKm,
    deltaHours,
    contained,
    reason: decision === "merge" ? pairRule.reason : "score_below_merge_threshold",
  };
}
