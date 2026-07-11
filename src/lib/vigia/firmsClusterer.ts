import type { ArgusIncidentKnowledge, ArgusIncidentSeverity } from "@/types/knowledgeIntake";

/**
 * Agrupa focos térmicos individuales de NASA FIRMS en incidentes de
 * incendio únicos, para que 20 detecciones satelitales de un mismo frente
 * no creen 20 "incendios" separados en el mapa.
 *
 * Estrategia: grilla de ~0.2° (~22 km). Todos los focos de la misma celda
 * y día forman un cluster; el incidente resultante lleva el conteo de
 * focos, el FRP máximo y el centroide. La confianza sube con la cantidad
 * de focos (detección múltiple ≈ incendio real, no falso positivo).
 */

const CELL_SIZE_DEGREES = 0.2;

export type FirmsCluster = {
  cellKey: string;
  count: number;
  latitude: number;
  longitude: number;
  maxFrp: number;
  countries: string[];
  earliest?: string;
  latest?: string;
  members: ArgusIncidentKnowledge[];
};

function cellKeyFor(latitude: number, longitude: number, dateBucket: string): string {
  const latCell = Math.floor(latitude / CELL_SIZE_DEGREES);
  const lngCell = Math.floor(longitude / CELL_SIZE_DEGREES);
  return `${latCell}:${lngCell}:${dateBucket}`;
}

function readFrp(incident: ArgusIncidentKnowledge): number {
  const technical = incident.technicalFactors as unknown as { frp?: number | string };
  const frp = Number(technical?.frp);
  return Number.isFinite(frp) ? frp : 0;
}

export function clusterFirmsIncidents(fociIncidents: ArgusIncidentKnowledge[]): FirmsCluster[] {
  const clusters = new Map<string, FirmsCluster>();
  for (const focus of fociIncidents) {
    if (typeof focus.latitude !== "number" || typeof focus.longitude !== "number") continue;
    const day = (focus.occurredAt ?? focus.detectedAt ?? new Date().toISOString()).slice(0, 10);
    const key = cellKeyFor(focus.latitude, focus.longitude, day);
    const existing = clusters.get(key);
    if (!existing) {
      clusters.set(key, {
        cellKey: key,
        count: 1,
        latitude: focus.latitude,
        longitude: focus.longitude,
        maxFrp: readFrp(focus),
        countries: focus.country ? [focus.country] : [],
        earliest: focus.occurredAt,
        latest: focus.occurredAt,
        members: [focus],
      });
      continue;
    }
    existing.members.push(focus);
    existing.count += 1;
    // Centroide incremental.
    existing.latitude += (focus.latitude - existing.latitude) / existing.count;
    existing.longitude += (focus.longitude - existing.longitude) / existing.count;
    existing.maxFrp = Math.max(existing.maxFrp, readFrp(focus));
    if (focus.country && !existing.countries.includes(focus.country)) existing.countries.push(focus.country);
    if (focus.occurredAt && (!existing.earliest || focus.occurredAt < existing.earliest)) existing.earliest = focus.occurredAt;
    if (focus.occurredAt && (!existing.latest || focus.occurredAt > existing.latest)) existing.latest = focus.occurredAt;
  }
  return [...clusters.values()];
}

export function severityForFirmsCluster(cluster: FirmsCluster): ArgusIncidentSeverity {
  if (cluster.count >= 25 || cluster.maxFrp >= 500) return "high";
  if (cluster.count >= 8 || cluster.maxFrp >= 150) return "medium";
  return "low";
}

export function confidenceForFirmsCluster(cluster: FirmsCluster): number {
  // Un foco aislado puede ser falso positivo (llamarada industrial, etc.);
  // muchos focos en la misma celda son casi con certeza fuego activo real.
  if (cluster.count >= 15) return 85;
  if (cluster.count >= 5) return 75;
  if (cluster.count >= 3) return 65;
  return 50;
}

export function firmsClusterToIncident(cluster: FirmsCluster): ArgusIncidentKnowledge {
  const severity = severityForFirmsCluster(cluster);
  const confidence = confidenceForFirmsCluster(cluster);
  const day = (cluster.earliest ?? new Date().toISOString()).slice(0, 10);
  // `getExternalIdFromIncident` recorta el prefijo "firms-" para
  // sourceId nasa_firms — la clave de celda+día queda como externalId
  // estable, así el mismo cluster se actualiza entre ejecuciones.
  const id = `firms-cluster-${cluster.cellKey.replace(/:/g, "-")}`;
  const country = cluster.countries[0];
  const nowIso = new Date().toISOString();
  const updatedAt = cluster.latest ?? nowIso;

  return {
    id,
    title: `Focos de incendio agrupados (${cluster.count} detecciones satelitales)`,
    summary: `NASA FIRMS detectó ${cluster.count} foco(s) térmico(s) en una celda de ~22 km el ${day}. FRP máximo ${Math.round(cluster.maxFrp)} MW. Detección satelital; requiere confirmación de autoridad local para perímetro y comando de incidente.`,
    domain: "wildfire",
    subtype: "thermal_anomaly_cluster",
    severity,
    confidenceScore: confidence,
    actionabilityScore: severity === "high" ? 70 : 50,
    sourceReliabilityScore: 80,
    evidenceCount: cluster.count,
    sourceIds: ["nasa_firms"],
    sourceNames: ["NASA FIRMS"],
    occurredAt: cluster.earliest,
    detectedAt: updatedAt,
    country,
    latitude: cluster.latitude,
    longitude: cluster.longitude,
    geometry: { type: "Point", coordinates: [cluster.longitude, cluster.latitude] },
    technicalFactors: {
      fociCount: cluster.count,
      maxFrp: cluster.maxFrp,
      cellKey: cluster.cellKey,
      satellite: "VIIRS/MODIS",
    } as unknown as ArgusIncidentKnowledge["technicalFactors"],
    causes: ["Anomalías térmicas satelitales agrupadas (NASA FIRMS)"],
    contributingFactors: cluster.count >= 8 ? ["Múltiples focos simultáneos en la misma celda"] : [],
    responseActions: ["Verificar con autoridad local de incendios antes de confirmar incendio forestal."],
    lessonsLearned: [],
    recommendedActions: [
      {
        id: `rec-${id}`,
        audience: "institutional",
        priority: severity === "high" ? "high" : "medium",
        text: "Revisar viento, humo y cercanía a zonas pobladas; contrastar con la autoridad de incendios del país.",
        rationale: "FIRMS entrega detección térmica, no perímetro confirmado ni comando de incidente.",
        confidenceScore: confidence,
        safetyLimit: "Un foco térmico no siempre es incendio forestal confirmado.",
        requiresHumanValidation: true,
      },
    ],
    relatedHistoricalEvents: [],
    similarIncidentIds: [],
    tags: ["nasa-firms", "wildfire", "cluster", ...(cluster.count < 3 ? ["no-confirmado"] : [])],
    language: "es",
    rawEvidenceRefs: ["https://firms.modaps.eosdis.nasa.gov/map/"],
    createdAt: cluster.earliest ?? nowIso,
    updatedAt,
  };
}
