/**
 * ARGUS — fixture QA del caso "sistema frontal en Chile" (Tarea 10 del
 * mandato de rearquitectura). Sigue el mismo patrón que `globalWatchSeed.ts`/
 * `chileAlertsSeed.ts` (datos sintéticos, nunca tocan producción, solo
 * consumibles en `seedMode`/tests).
 *
 * Representa lo que, HOY, el pipeline real produciría para un sistema
 * frontal que afecta una región de Chile: una alerta SENAPRED de mal tiempo
 * (severidad alta), un incidente de inundación asociado, y daño a
 * infraestructura reportado por separado — tres filas `KnowledgeIncident`
 * independientes, sin el ARGUS Fusion Engine, exactamente el problema que
 * describe el mandato original ("ARGUS no creó un incidente maestro").
 *
 * Lo que este fixture DELIBERADAMENTE NO incluye, porque no existe ningún
 * código de ingesta que pudiera producirlo (confirmado por auditoría, no
 * supuesto):
 * - CSN (sismología), SHOA (tsunami/marejadas), SERNAGEOMIN (volcanes),
 *   MOP (cortes de ruta), DGA (nivel de ríos), CONAF (incendios) — todas
 *   registradas en `src/data/countrySourcePacks/chile.ts` con
 *   `status: "requires_parser"`, cero adaptador implementado.
 * - Cortes eléctricos: no existe ninguna fuente, tabla ni adaptador para
 *   esto en todo el repositorio.
 * - MeteoChile/DMC como fuente directa: solo se extrae como mención de
 *   texto dentro de la alerta SENAPRED (`dmcProvider.ts`), nunca como feed
 *   propio.
 *
 * Ver `tests/incidents/chileFrontalSystemAcceptance.test.ts` para la
 * reconstrucción completa (qué se agrupó, qué módulos se recomendaron, qué
 * seguiría faltando) y `docs/architecture/ARGUS_FUSION_ENGINE_IMPLEMENTATION.md`
 * para el resultado narrado.
 */

export type ChileFrontalSystemIncidentRow = {
  id: string;
  domain: string;
  severity: string;
  effectiveSeverity: string | null;
  confidenceScore: number;
  actionabilityScore: number;
  sourceReliabilityScore: number;
  title: string;
  sourceName: string;
  country: string | null;
  region: string | null;
  locality: string | null;
  latitude: number | null;
  longitude: number | null;
  occurredAt: Date | null;
  detectedAt: Date | null;
  createdAt: Date;
  status: string | null;
};

const BASE_OCCURRED_AT = new Date("2026-07-16T14:00:00.000Z");

/** Ancla: alerta SENAPRED de sistema frontal severo, ya persistida por `chileAlertPromotionEngine.ts`. */
export const CHILE_FRONTAL_SYSTEM_ANCHOR: ChileFrontalSystemIncidentRow = {
  id: "chile-frontal-anchor",
  domain: "storm",
  severity: "high",
  effectiveSeverity: "high",
  confidenceScore: 90,
  actionabilityScore: 85,
  sourceReliabilityScore: 95,
  title: "Alerta Roja por sistema frontal — Región de Valparaíso",
  sourceName: "SENAPRED",
  country: "CL",
  region: "Valparaiso",
  locality: "Quilpue",
  latitude: -33.05,
  longitude: -71.44,
  occurredAt: BASE_OCCURRED_AT,
  detectedAt: BASE_OCCURRED_AT,
  createdAt: BASE_OCCURRED_AT,
  status: "active",
};

/** Acompañante: inundación en la misma región/ventana (dominio distinto → hoy queda como incidente separado). */
export const CHILE_FRONTAL_SYSTEM_FLOOD: ChileFrontalSystemIncidentRow = {
  id: "chile-frontal-flood",
  domain: "flood",
  severity: "high",
  effectiveSeverity: "high",
  confidenceScore: 75,
  actionabilityScore: 80,
  sourceReliabilityScore: 70,
  title: "Desborde de cauce menor — Quilpué",
  sourceName: "ReliefWeb",
  country: "CL",
  region: "Valparaiso",
  locality: "Quilpue",
  latitude: -33.05,
  longitude: -71.44,
  occurredAt: new Date(BASE_OCCURRED_AT.getTime() + 3 * 60 * 60 * 1000),
  detectedAt: new Date(BASE_OCCURRED_AT.getTime() + 3 * 60 * 60 * 1000),
  createdAt: new Date(BASE_OCCURRED_AT.getTime() + 3 * 60 * 60 * 1000),
  status: "active",
};

/** Acompañante: daño a infraestructura reportado por separado (otra fuente, otro dominio). */
export const CHILE_FRONTAL_SYSTEM_INFRASTRUCTURE: ChileFrontalSystemIncidentRow = {
  id: "chile-frontal-infrastructure",
  domain: "infrastructure_damage",
  severity: "medium",
  effectiveSeverity: "medium",
  confidenceScore: 65,
  actionabilityScore: 60,
  sourceReliabilityScore: 60,
  title: "Caída de árboles y corte de ruta local — Quilpué",
  sourceName: "GDACS",
  country: "CL",
  region: "Valparaiso",
  locality: "Quilpue",
  latitude: -33.06,
  longitude: -71.43,
  occurredAt: new Date(BASE_OCCURRED_AT.getTime() + 5 * 60 * 60 * 1000),
  detectedAt: new Date(BASE_OCCURRED_AT.getTime() + 5 * 60 * 60 * 1000),
  createdAt: new Date(BASE_OCCURRED_AT.getTime() + 5 * 60 * 60 * 1000),
  status: "active",
};

export const CHILE_FRONTAL_SYSTEM_COMPANIONS: ChileFrontalSystemIncidentRow[] = [
  CHILE_FRONTAL_SYSTEM_FLOOD,
  CHILE_FRONTAL_SYSTEM_INFRASTRUCTURE,
];

/** Albergue Código Azul activo en la misma región — para la verificación de contexto de refugios. */
export const CHILE_FRONTAL_SYSTEM_SHELTER = {
  id: "shelter-quilpue-1",
  name: "Gimnasio Municipal Quilpué",
  countryCode: "CL",
  adminLevel1: "Valparaiso",
  category: "shelter",
  operationalStatus: { shelterStatus: "available" },
};
