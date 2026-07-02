import { knowledgeSourceRegistry } from "@/data/knowledgeSourceRegistry";
import type {
  ArgusHazardDomain,
  ArgusKnowledgeInputType,
  ArgusKnowledgeSource,
  ArgusKnowledgeSourceStatus,
} from "@/types/knowledgeIntake";

const runtimeSources = new Map<string, ArgusKnowledgeSource>(
  knowledgeSourceRegistry.map((source) => [source.id, source])
);

export function getAllKnowledgeSources() {
  return Array.from(runtimeSources.values());
}

export function getEnabledKnowledgeSources() {
  return getAllKnowledgeSources().filter((source) => source.status === "active");
}

export function getSourcesByDomain(domain: ArgusHazardDomain) {
  return getAllKnowledgeSources().filter((source) => source.domains.includes(domain));
}

export function getSourcesByInputType(inputType: ArgusKnowledgeInputType) {
  return getAllKnowledgeSources().filter((source) => source.inputTypes.includes(inputType));
}

export function getSourceById(id: string) {
  return runtimeSources.get(id) ?? null;
}

export function registerKnowledgeSource(source: ArgusKnowledgeSource) {
  runtimeSources.set(source.id, source);
  return source;
}

export function updateKnowledgeSourceStatus(
  sourceId: string,
  status: ArgusKnowledgeSourceStatus
) {
  const current = runtimeSources.get(sourceId);
  if (!current) return null;
  const updated = { ...current, status };
  runtimeSources.set(sourceId, updated);
  return updated;
}

export function getKnowledgeSourceStats() {
  const sources = getAllKnowledgeSources();
  return {
    total: sources.length,
    active: sources.filter((source) => source.status === "active").length,
    planned: sources.filter((source) => source.status === "planned").length,
    manual: sources.filter((source) => source.status === "manual").length,
    disabled: sources.filter((source) => source.status === "disabled").length,
    requiresReview: sources.filter((source) => source.status === "requiresReview").length,
    requiresConfiguration: sources.filter((source) => source.status === "requiresConfiguration").length,
    requiresApiKey: sources.filter((source) => source.status === "requiresApiKey").length,
    stub: sources.filter((source) => source.status === "stub").length,
  };
}
