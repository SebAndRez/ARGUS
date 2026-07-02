import type { ArgusKnowledgeInputEnvelope } from "@/types/knowledgeIntake";

export type KnowledgeAdapterResult = {
  adapterId: string;
  sourceId: string;
  status: "ready" | "planned" | "requiresConfiguration" | "requiresApiKey" | "disabled" | "error";
  message: string;
  envelopes: ArgusKnowledgeInputEnvelope[];
};

export function plannedAdapterResult(sourceId: string, adapterId: string): KnowledgeAdapterResult {
  return {
    adapterId,
    sourceId,
    status: "planned",
    message: "Adapter stub registered. No external API call is performed in this build.",
    envelopes: [],
  };
}
