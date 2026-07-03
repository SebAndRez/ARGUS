import type { ArgusNormalizedEvent } from "@/types/ingestion";
import type {
  HazardKnowledgeDocumentSummary,
  HazardKnowledgeFact,
} from "@/types/hazardKnowledge";

export type ArgusRiskType =
  | "tsunami"
  | "earthquake_impact"
  | "fire_smoke"
  | "volcano_activity"
  | "humanitarian_impact"
  | "general_escalation";

export type ArgusRiskStatus =
  | "watch"
  | "possible"
  | "probable"
  | "confirmed"
  | "reduced"
  | "dismissed"
  | "insufficient_data";

export type ArgusProbabilityBand =
  | "very_low"
  | "low"
  | "medium"
  | "high"
  | "critical";

export interface ArgusRiskEvidence {
  id: string;
  sourceId: string;
  sourceName?: string;
  externalEventId?: string;
  kind: string;
  weight: number;
  finding: string;
  observedAt?: string;
  url?: string;
}

export interface ArgusRiskHistoricalContext {
  explanation: string;
  facts: HazardKnowledgeFact[];
  documents: HazardKnowledgeDocumentSummary[];
}

export interface ArgusRiskAssessment {
  id: string;
  riskType: ArgusRiskType;
  status: ArgusRiskStatus;
  probabilityBand: ArgusProbabilityBand;
  probabilityScore: number;
  confidence: number;
  severity: string;
  title: string;
  summary: string;
  recommendedAction: string;
  timeframe: string;
  evidence: ArgusRiskEvidence[];
  relatedExternalEventIds: string[];
  createdAt: string;
  updatedAt: string;
  nextReviewAt?: string;
  historicalContext?: ArgusRiskHistoricalContext;
}

export interface ArgusRiskEngineInput {
  externalEvents: ArgusNormalizedEvent[];
  correlations?: Array<{
    kind: string;
    confidence?: number | null;
    explanation?: string | null;
    eventIds?: string[];
    sourceIds?: string[];
  }>;
  weather?: unknown;
  userLocation?: { latitude: number; longitude: number } | null;
  historicalFacts?: HazardKnowledgeFact[];
  historicalDocuments?: HazardKnowledgeDocumentSummary[];
}
