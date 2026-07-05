import type { CrisisEvent } from "@/types/crisis";

/**
 * Tipos propios de ARGUS ATLAS (centro de mando operacional). ATLAS visualiza
 * y coordina datos que ya existen en ARGUS Core (eventos, fuentes,
 * auditoría); no reemplaza ni recalcula esos datos, solo los presenta bajo
 * una capa ejecutiva.
 */

export type AtlasSeverity = "low" | "medium" | "high" | "critical";

export interface AtlasKpi {
  id: string;
  label: string;
  value: string | number;
  severity: AtlasSeverity;
  helperText?: string;
  trend?: "up" | "down" | "stable";
}

export type AtlasIncidentStatus = "new" | "monitoring" | "confirmed" | "resolved";

export interface AtlasIncidentSummary {
  id: string;
  title: string;
  type: string;
  severity: AtlasSeverity;
  status: AtlasIncidentStatus;
  locationLabel: string;
  updatedAt: string;
  sourceCount: number;
  citizenReportCount: number;
  sourceEvent?: CrisisEvent;
}

export interface AtlasDecisionLogItem {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  module?: string;
  severity?: AtlasSeverity;
}

export type AtlasModuleOperationalStatus =
  | "active"
  | "available"
  | "restricted"
  | "pending"
  | "recommended"
  | "offline";

export interface AtlasModuleStatus {
  moduleId: string;
  name: string;
  status: AtlasModuleOperationalStatus;
  reason?: string;
}

export type AtlasAlertLevel = "critical" | "high" | "medium" | "info";

export interface AtlasAlertQueueItem {
  id: string;
  level: AtlasAlertLevel;
  title: string;
  status: string;
  occurredAt: string;
  relatedModule?: string;
  suggestedAction: string;
}

export interface AtlasSourceSummary {
  activeCount: number;
  errorCount: number;
  lastUpdatedLabel: string;
  averageConfidenceLabel: string;
  contradictionCount: number;
}

export interface AtlasCitizenReportsSummary {
  newCount: number;
  pendingValidationCount: number;
  confirmedCount: number;
  discardedCount: number;
  highReputationReporters: number;
  withMediaEvidence: number;
}

export interface AtlasRiskSummary {
  globalRisk: AtlasSeverity;
  criticalEventCount: number;
  topRiskZones: string[];
  explanation: string;
}
