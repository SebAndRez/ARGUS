import { prisma } from "@/lib/prisma";
import type { ArgusIncidentKnowledge } from "@/types/knowledgeIntake";

function normalizeTitle(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 90);
}

function roundCoordinate(value?: number) {
  return typeof value === "number" ? Math.round(value * 10) / 10 : null;
}

export function getExternalIdFromIncident(incident: ArgusIncidentKnowledge) {
  const sourceId = incident.sourceIds[0] ?? "unknown";
  if (sourceId === "usgs_earthquake" && incident.id.startsWith("usgs-")) {
    return incident.id.slice("usgs-".length);
  }
  if (sourceId === "nasa_firms" && incident.id.startsWith("firms-")) {
    return incident.id.slice("firms-".length);
  }
  if (sourceId === "reliefweb" && incident.id.startsWith("reliefweb-")) {
    return incident.id.slice("reliefweb-".length);
  }
  if (sourceId === "gdacs" && incident.id.startsWith("gdacs-")) {
    return incident.id.slice("gdacs-".length);
  }
  if (sourceId === "nasa-eonet" && incident.id.startsWith("eonet-")) {
    return incident.id.slice("eonet-".length);
  }
  if (sourceId === "nws" && incident.id.startsWith("nws-")) {
    return incident.id.slice("nws-".length);
  }
  if (sourceId === "noaa-storm-events" && incident.id.startsWith("noaa-storm-events-")) {
    return incident.id.slice("noaa-storm-events-".length);
  }
  if (sourceId === "noaa-ncei-tsunami" && incident.id.startsWith("noaa-ncei-tsunami-")) {
    return incident.id.slice("noaa-ncei-tsunami-".length);
  }
  if (sourceId === "openfema" && incident.id.startsWith("openfema-")) {
    return incident.id.slice("openfema-".length);
  }
  return incident.id;
}

export function buildIncidentDedupKey(incident: ArgusIncidentKnowledge) {
  const externalId = getExternalIdFromIncident(incident);
  if (externalId) return `${incident.sourceIds[0] ?? "unknown"}:${externalId}`;
  return [
    incident.sourceNames[0] ?? "unknown",
    incident.domain,
    incident.occurredAt ?? "unknown-time",
    roundCoordinate(incident.latitude) ?? "no-lat",
    roundCoordinate(incident.longitude) ?? "no-lng",
    normalizeTitle(incident.title),
  ].join(":");
}

export async function findExistingIncident(incident: ArgusIncidentKnowledge) {
  const sourceId = incident.sourceIds[0] ?? "unknown";
  const externalId = getExternalIdFromIncident(incident);
  if (externalId) {
    const existing = await prisma.knowledgeIncident.findUnique({
      where: { sourceId_externalId: { sourceId, externalId } },
    });
    if (existing) return existing;
  }

  const occurredAt = incident.occurredAt ? new Date(incident.occurredAt) : null;
  return prisma.knowledgeIncident.findFirst({
    where: {
      sourceId,
      domain: incident.domain,
      title: { contains: normalizeTitle(incident.title).split(" ")[0] ?? incident.title, mode: "insensitive" },
      ...(occurredAt ? { occurredAt } : {}),
      ...(typeof incident.latitude === "number" && typeof incident.longitude === "number"
        ? {
            latitude: { gte: roundCoordinate(incident.latitude)! - 0.15, lte: roundCoordinate(incident.latitude)! + 0.15 },
            longitude: { gte: roundCoordinate(incident.longitude)! - 0.15, lte: roundCoordinate(incident.longitude)! + 0.15 },
          }
        : {}),
    },
  });
}

export function shouldUpdateExistingIncident(
  existing: {
    sourceId?: string;
    confidenceScore: number;
    updatedAt: Date;
    evidenceCount?: number | null;
    severity?: string | null;
    geometryJson?: unknown;
    technicalFactorsJson?: unknown;
    summary?: string | null;
  },
  incoming: ArgusIncidentKnowledge
) {
  if (incoming.confidenceScore > existing.confidenceScore) return true;
  if ((incoming.evidenceCount ?? 0) > (existing.evidenceCount ?? 0)) return true;
  if (
    existing.sourceId === "nws" ||
    existing.sourceId === "noaa-storm-events" ||
    existing.sourceId === "noaa-ncei-tsunami" ||
    existing.sourceId === "openfema" ||
    // GDACS `dateModified` mirrors GDACS's own feed timestamp, which stops
    // advancing once an episode ages out of the rolling RSS window — the
    // final `incomingUpdatedAt > existing.updatedAt` check below would
    // never fire for those, permanently locking in a stale severity
    // (ARGUS v1.0.3.2: GDACS Green severity canonicalization) even after
    // the computation itself was fixed. Forcing the severity check here
    // lets a corrected recomputation overwrite an old value on the next run.
    existing.sourceId === "gdacs"
  ) {
    if (existing.severity !== incoming.severity) return true;
    const existingTech = JSON.stringify(existing.technicalFactorsJson ?? {});
    const incomingTech = JSON.stringify(incoming.technicalFactors ?? {});
    if (existingTech !== incomingTech) return true;
    const existingGeometry = JSON.stringify(existing.geometryJson ?? null);
    const incomingGeometry = JSON.stringify(incoming.geometry ?? null);
    if (existingGeometry !== incomingGeometry) return true;
    if ((existing.summary ?? "") !== incoming.summary) return true;
  }
  const incomingUpdatedAt = new Date(incoming.updatedAt);
  return Number.isFinite(incomingUpdatedAt.getTime()) && incomingUpdatedAt > existing.updatedAt;
}

export function mergeIncidentKnowledge<TExisting extends { id: string }>(
  existing: TExisting,
  incoming: ArgusIncidentKnowledge
) {
  return {
    ...incoming,
    id: existing.id,
    tags: [...new Set(incoming.tags)],
    rawEvidenceRefs: [...new Set(incoming.rawEvidenceRefs)],
  };
}
