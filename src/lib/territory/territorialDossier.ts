import type { ModuleIncidentSummary } from "@/types/moduleOperationalContext";
import { fetchCanonicalModuleIncidents } from "@/lib/modules/canonicalIncidentGateway";
import { buildIncidentImpactAssessment } from "@/lib/impact/incidentImpactAssessment";
import { getRealFenixShelters } from "@/lib/fenix/fenixShelterSource";
import { getArgusMarkerSeverityRank, normalizeArgusMapSeverity } from "@/lib/mapSymbols/argusMapSymbols";
import { resolveTerritorialIdentity } from "@/lib/territory/territorialIdentityResolver";
import type {
  CrisisRelationSummary,
  DossierOverallStatus,
  DossierSection,
  DossierSectionStatus,
  RelatedIncidentSummary,
  TerritorialDossier,
} from "@/types/territorialDossier";
import type { ImpactedInfrastructureAsset } from "@/types/incidentImpactAssessment";
import type { FenixShelter } from "@/types/fenix";

/**
 * ARGUS — expediente territorial (Prompt 7). Ver docstring de
 * `src/types/territorialDossier.ts` para el contrato y la auditoría previa.
 * Sigue exactamente el mismo idioma que `buildIncidentImpactAssessment`
 * (Prompt 6, `src/lib/impact/incidentImpactAssessment.ts`): un punto de
 * entrada único sobre un `ModuleIncidentSummary` ya resuelto, un sub-builder
 * real por sección, `NOT_AVAILABLE`/`UNAVAILABLE` explícito con razón cuando
 * no existe una fuente real, nunca una fabricación silenciosa.
 *
 * Explícitamente NO recalcula impacto: `infrastructure`/`population` se leen
 * tal cual del `IncidentImpactAssessment` ya calculado por el Prompt 6
 * (§26 del mandato: "el expediente no debe recalcular impacto").
 */

export const DOSSIER_VERSION = "1.0.0";

const RELATED_INCIDENTS_RADIUS_LIMIT = 10;
const SHELTER_SEARCH_RADIUS_KM = 10; // mismo valor que IncidentShelterOperationalSection.tsx, para no divergir del radio ya en producción

function buildRelationId(
  sourceType: string,
  sourceId: string,
  relationType: string,
  targetType: string,
  targetId: string
): string {
  return `${sourceType}:${sourceId}:${relationType}:${targetType}:${targetId}`;
}

async function buildRelatedIncidentsSection(
  incident: ModuleIncidentSummary,
  regionCode: string | null
): Promise<DossierSection<RelatedIncidentSummary[]>> {
  if (!regionCode) {
    return {
      status: "NOT_APPLICABLE",
      data: [],
      reason: "El incidente no tiene un regionCode canónico resuelto — no hay territorio contra el cual buscar otros incidentes.",
    };
  }

  const result = await fetchCanonicalModuleIncidents({ regionCode, limit: RELATED_INCIDENTS_RADIUS_LIMIT + 1 });
  if (!result.ok) {
    return { status: "UNAVAILABLE", data: [], reason: result.error.message };
  }

  const related = result.page.summaries
    .filter((summary) => summary.id !== incident.id)
    .sort(
      (a, b) =>
        getArgusMarkerSeverityRank(normalizeArgusMapSeverity(b.severity)) -
          getArgusMarkerSeverityRank(normalizeArgusMapSeverity(a.severity)) ||
        new Date(b.timing.updatedAt).getTime() - new Date(a.timing.updatedAt).getTime()
    )
    .slice(0, RELATED_INCIDENTS_RADIUS_LIMIT)
    .map((summary) => ({ id: summary.id, title: summary.title, type: summary.type, severity: summary.severity }));

  return { status: "AVAILABLE", data: related };
}

async function buildSheltersSection(
  point: { lat: number; lng: number } | null
): Promise<DossierSection<FenixShelter[]>> {
  if (!point) {
    return { status: "NOT_APPLICABLE", data: [], reason: "El incidente no tiene un punto representativo resoluble." };
  }
  try {
    const shelters = await getRealFenixShelters(point, SHELTER_SEARCH_RADIUS_KM);
    return { status: "AVAILABLE", data: shelters };
  } catch {
    return { status: "UNAVAILABLE", data: [], reason: "No se pudo consultar refugios reales cercanos." };
  }
}

function buildRelationships(
  incident: ModuleIncidentSummary,
  territory: TerritorialDossier["territory"],
  infrastructure: ImpactedInfrastructureAsset[],
  relatedIncidents: RelatedIncidentSummary[]
): CrisisRelationSummary[] {
  const relations: CrisisRelationSummary[] = [];

  territory.intersectedAdministrativeAreas.forEach((areaName) => {
    relations.push({
      id: buildRelationId("INCIDENT", incident.id, "LOCATED_IN", "TERRITORY", areaName),
      sourceEntityType: "INCIDENT",
      sourceEntityId: incident.id,
      relationType: "LOCATED_IN",
      targetEntityType: "TERRITORY",
      targetEntityId: areaName,
      targetLabel: areaName,
      status: "CALCULATED",
      confidence: 90,
      methodology: "Punto-en-polígono contra la geometría administrativa real del incidente (argusGeometryResolver).",
    });
  });

  infrastructure
    .filter((asset) => asset.spatialRelation === "INSIDE" || asset.spatialRelation === "BORDER")
    .forEach((asset) => {
      relations.push({
        id: buildRelationId("INCIDENT", incident.id, "AFFECTS", "INFRASTRUCTURE", asset.poiId),
        sourceEntityType: "INCIDENT",
        sourceEntityId: incident.id,
        relationType: "AFFECTS",
        targetEntityType: "INFRASTRUCTURE",
        targetEntityId: asset.poiId,
        targetLabel: asset.name,
        status: "CALCULATED",
        confidence: asset.spatialRelation === "INSIDE" ? 85 : 60,
        methodology: `Relación espacial "${asset.spatialRelation}" del análisis de impacto (Prompt 6) — no recalculada aquí.`,
      });
    });

  relatedIncidents.forEach((related) => {
    relations.push({
      id: buildRelationId("INCIDENT", incident.id, "CORRELATED_WITH", "INCIDENT", related.id),
      sourceEntityType: "INCIDENT",
      sourceEntityId: incident.id,
      relationType: "CORRELATED_WITH",
      targetEntityType: "INCIDENT",
      targetEntityId: related.id,
      targetLabel: related.title,
      // Deliberadamente CORRELATED_WITH, nunca CAUSED_BY: la única señal es
      // compartir el mismo regionCode, no proximidad temporal ni geometría
      // de causalidad real (Prompt 7 §24: "no inferir causalidad únicamente
      // por proximidad").
      status: "CALCULATED",
      confidence: 35,
      methodology: "Mismo regionCode canónico que el incidente origen — no implica causalidad ni relación geométrica confirmada.",
    });
  });

  return relations;
}

function computeOverallStatus(sections: DossierSectionStatus[]): DossierOverallStatus {
  if (sections.every((status) => status === "AVAILABLE" || status === "NOT_APPLICABLE")) return "COMPLETE";
  if (sections.some((status) => status === "STALE")) return "STALE";
  if (sections.every((status) => status === "UNAVAILABLE")) return "FAILED";
  return "PARTIAL";
}

export interface BuildTerritorialDossierOptions {
  /** Reloj inyectable para tests deterministas — por defecto `new Date()`. */
  now?: Date;
}

/**
 * Punto de entrada único. Recibe un `ModuleIncidentSummary` ya resuelto por
 * `getModuleIncidentDetailContext` (mismo contrato reutilizado por el
 * análisis de impacto, Prompt 6) — nunca resuelve el incidente por su
 * cuenta.
 */
export async function buildTerritorialDossier(
  incident: ModuleIncidentSummary,
  options: BuildTerritorialDossierOptions = {}
): Promise<TerritorialDossier> {
  const now = options.now ?? new Date();
  const territory = resolveTerritorialIdentity(incident);
  const limitations: string[] = [];

  // Nunca recalcula impacto (Prompt 7 §26) — consume el mismo servicio del Prompt 6.
  const impact = await buildIncidentImpactAssessment(incident, { now });

  const infrastructure: DossierSection<ImpactedInfrastructureAsset[]> =
    impact.infrastructure.dataState === "CALCULATED"
      ? { status: "AVAILABLE", data: impact.infrastructure.assets }
      : { status: "UNAVAILABLE", data: [], reason: impact.infrastructure.searchRadiusRationale };

  const population: DossierSection<null> = { status: "UNAVAILABLE", data: null, reason: impact.population.reason };
  limitations.push(`Población: ${impact.population.reason}`);

  const point =
    territory.latitude !== null && territory.longitude !== null
      ? { lat: territory.latitude, lng: territory.longitude }
      : null;

  const [relatedIncidentsSection, sheltersSection] = await Promise.all([
    buildRelatedIncidentsSection(incident, territory.regionCode),
    buildSheltersSection(point),
  ]);
  if (relatedIncidentsSection.reason) limitations.push(`Incidentes relacionados: ${relatedIncidentsSection.reason}`);
  if (sheltersSection.reason) limitations.push(`Refugios: ${sheltersSection.reason}`);

  const organizations: DossierSection<never[]> = {
    status: "UNAVAILABLE",
    data: [],
    reason:
      "ARGUS no tiene hoy un directorio real de organizaciones/autoridades con contacto y jurisdicción — countrySourceRegistry.ts cataloga fuentes de datos, no organismos. No se inventaron autoridades ni contactos.",
  };
  limitations.push(`Organizaciones: ${organizations.reason}`);

  const historicalRisks: DossierSection<never[]> = {
    status: "UNAVAILABLE",
    data: [],
    reason:
      "No existe hoy una clasificación de incidentes históricos (HISTORICAL/SEASONAL/STRUCTURAL) separada de incidentes activos — requiere filtrar KnowledgeIncident por lifecycle resuelto + ventana histórica, no implementado en este pase.",
  };
  limitations.push(`Riesgos históricos: ${historicalRisks.reason}`);

  const relationships = buildRelationships(incident, territory, infrastructure.data, relatedIncidentsSection.data);

  const overallStatus = computeOverallStatus([
    infrastructure.status,
    population.status,
    relatedIncidentsSection.status,
    sheltersSection.status,
    organizations.status,
    historicalRisks.status,
  ]);

  return {
    incidentId: incident.id,
    generatedAt: now.toISOString(),
    dossierVersion: DOSSIER_VERSION,
    territory,
    relatedIncidents: relatedIncidentsSection,
    infrastructure,
    shelters: sheltersSection,
    population,
    organizations,
    historicalRisks,
    relationships,
    overallStatus,
    limitations,
    isDemo: Boolean(incident.isDemo),
  };
}
