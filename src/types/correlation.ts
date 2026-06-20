import type {
  ArgusExternalSourceId,
  ArgusIngestionSeverity,
  ArgusNormalizedEvent,
} from "@/types/ingestion";

export type ArgusCorrelationKind =
  | "same_event"
  | "related_hazard"
  | "earthquake_tsunami"
  | "official_confirmation"
  | "possible_duplicate";

export interface ArgusCorrelatedIncident {
  id: string;
  title: string;
  kind: ArgusCorrelationKind;
  primaryEvent: ArgusNormalizedEvent;
  relatedEvents: ArgusNormalizedEvent[];
  sourceIds: ArgusExternalSourceId[];
  confidence: number;
  severity: ArgusIngestionSeverity;
  explanation: string;
  recommendedAction: string;
  createdAtLabel: string;
}
