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
  existing: { confidenceScore: number; updatedAt: Date; evidenceCount?: number | null },
  incoming: ArgusIncidentKnowledge
) {
  if (incoming.confidenceScore > existing.confidenceScore) return true;
  if ((incoming.evidenceCount ?? 0) > (existing.evidenceCount ?? 0)) return true;
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
