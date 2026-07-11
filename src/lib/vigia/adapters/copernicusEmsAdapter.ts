import type { ArgusIncidentKnowledge, ArgusIncidentSeverity } from "@/types/knowledgeIntake";
import { classifyGlobalThreat, threatToHazardDomain } from "@/lib/vigia/threatClassifier";

/**
 * Copernicus Emergency Management Service (Rapid Mapping) adapter.
 * Usa la API JSON pública del dashboard de Rapid Mapping — cada activación
 * EMSR es un mapeo de emergencia solicitado por un Estado/organismo
 * autorizado, lo que la vuelve una señal oficial fuerte de que un desastre
 * real está en curso. (El antiguo feed GeoRSS de emergency.copernicus.eu
 * fue dado de baja; verificado 2026-07: devuelve 404.)
 */

const EMS_API_URL =
  "https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations-info/?limit=60";

export type CopernicusEmsActivation = {
  code?: string;
  countries?: string[];
  eventTime?: string;
  name?: string;
  /** WKT "POINT (lng lat)" */
  centroid?: string;
  activationTime?: string;
  category?: string;
  lastUpdate?: string;
  closed?: boolean;
  gdacsId?: string | null;
};

type EmsApiResponse = {
  count?: number;
  results?: CopernicusEmsActivation[];
};

export function parseWktPoint(wkt: string | undefined): { latitude: number; longitude: number } | null {
  const match = wkt?.match(/POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/i);
  if (!match) return null;
  const longitude = Number(match[1]);
  const latitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function severityForActivation(activation: CopernicusEmsActivation): ArgusIncidentSeverity {
  // Una activación EMS abierta ya implica impacto suficiente para pedir
  // mapeo de emergencia — piso "high"; cerrada baja a "medium" y el ciclo
  // de vida la mueve a monitoring/resolved.
  return activation.closed ? "medium" : "high";
}

export function normalizeCopernicusEmsActivation(activation: CopernicusEmsActivation): ArgusIncidentKnowledge | null {
  const code = activation.code?.trim();
  const name = activation.name?.trim();
  if (!code || !name) return null;

  const point = parseWktPoint(activation.centroid);
  const threat = classifyGlobalThreat({ title: `${activation.category ?? ""} ${name}` });
  const severity = severityForActivation(activation);
  const occurredAt = activation.eventTime ? new Date(activation.eventTime).toISOString() : undefined;
  const updatedAt = activation.lastUpdate
    ? new Date(activation.lastUpdate).toISOString()
    : occurredAt ?? new Date().toISOString();
  const id = `copernicus-ems-${code.toLowerCase()}`;
  const country = activation.countries?.[0];
  const url = `https://rapidmapping.emergency.copernicus.eu/${code}/`;

  return {
    id,
    title: `${code}: ${name}`,
    summary: `Activación de mapeo rápido Copernicus EMS ${code} (${activation.category ?? "sin categoría"}) en ${activation.countries?.join(", ") ?? "ubicación por confirmar"}. Estado: ${activation.closed ? "cerrada" : "abierta"}. Una activación EMS indica que un organismo autorizado solicitó cartografía de emergencia para un evento real.`,
    domain: threatToHazardDomain(threat),
    subtype: threat.toLowerCase(),
    severity,
    confidenceScore: 88,
    actionabilityScore: severity === "high" ? 80 : 60,
    sourceReliabilityScore: 91,
    evidenceCount: 1,
    sourceIds: ["copernicus_ems"],
    sourceNames: ["Copernicus EMS"],
    occurredAt,
    detectedAt: updatedAt,
    country,
    latitude: point?.latitude,
    longitude: point?.longitude,
    geometry: point ? { type: "Point", coordinates: [point.longitude, point.latitude] } : undefined,
    technicalFactors: {
      activationCode: code,
      category: activation.category,
      closed: activation.closed ?? false,
      gdacsId: activation.gdacsId ?? undefined,
      threatType: threat,
    } as unknown as ArgusIncidentKnowledge["technicalFactors"],
    causes: ["Activación oficial de Copernicus Emergency Management Service"],
    contributingFactors: [],
    responseActions: ["Revisar productos cartográficos EMS publicados para la activación."],
    lessonsLearned: [],
    recommendedActions: [
      {
        id: `rec-${id}`,
        audience: "institutional",
        priority: severity === "high" ? "high" : "medium",
        text: "Consultar los mapas de la activación EMS y coordinar con la autoridad solicitante.",
        rationale: "Una activación EMS indica que un organismo autorizado solicitó mapeo de emergencia para un evento real.",
        confidenceScore: 85,
        safetyLimit: "Estimación informativa ARGUS; no reemplaza instrucciones oficiales locales.",
        requiresHumanValidation: false,
      },
    ],
    relatedHistoricalEvents: [],
    similarIncidentIds: [],
    tags: ["copernicus-ems", threat.toLowerCase(), code.toLowerCase(), activation.closed ? "closed" : "open"],
    language: "es",
    rawEvidenceRefs: [url],
    createdAt: occurredAt ?? updatedAt,
    updatedAt,
  };
}

export async function fetchCopernicusEmsActivations(params: { daysBack?: number; limit?: number } = {}) {
  const daysBack = Math.min(Math.max(params.daysBack ?? 14, 1), 90);
  const limit = Math.min(Math.max(params.limit ?? 60, 1), 200);
  const warnings: string[] = [];
  const errors: string[] = [];
  let activations: CopernicusEmsActivation[] = [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(EMS_API_URL, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Copernicus EMS API respondió ${response.status}`);
    const data = (await response.json()) as EmsApiResponse;
    activations = data.results ?? [];
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Copernicus EMS API fetch failed");
  } finally {
    clearTimeout(timeout);
  }

  const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000;
  const incidents = activations
    .filter((activation) => {
      const reference = activation.lastUpdate ?? activation.eventTime;
      if (!reference) return true;
      const time = Date.parse(reference);
      return !Number.isFinite(time) || time >= cutoff;
    })
    .map(normalizeCopernicusEmsActivation)
    .filter((incident): incident is ArgusIncidentKnowledge => Boolean(incident))
    .slice(0, limit);

  return {
    adapterId: "copernicusEmsAdapter",
    sourceId: "copernicus_ems",
    sourceName: "Copernicus EMS",
    status: incidents.length > 0 ? ("ready" as const) : errors.length > 0 ? ("error" as const) : ("empty" as const),
    fetchedAt: new Date().toISOString(),
    fetched: activations.length,
    count: incidents.length,
    incidents,
    warnings,
    errors,
  };
}
