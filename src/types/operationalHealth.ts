import type { ComponentHealth, OperationalHealthStatus } from "@/lib/observability/healthStatus";

/**
 * ARGUS Prompt 19 §23, §27 — contrato del snapshot operacional consolidado.
 * No incluye payloads completos ni datos personales — solo estado agregado,
 * conteos y razones normalizadas.
 */
export type OperationalIssue = {
  code: string;
  severity: "critical" | "high" | "medium" | "low";
  component: string;
  status: "active" | "recovering" | "resolved";
  /** Primera vez que ESTE proceso observó el problema — nunca un timestamp inventado. */
  detectedAt: string;
  lastObservedAt: string;
  summary: string;
  runbookId?: string;
};

export type PipelineHealth = {
  pipeline: "global-watch" | "chile-alerts";
  status: OperationalHealthStatus;
  lastSuccessAt: string | null;
  freshnessWindowMinutes: number;
  detail: string;
};

export type SourcesComponentHealth = ComponentHealth & {
  operational: number;
  degraded: number;
  broken: number;
  disabled: number;
  total: number;
};

/** Fase C / Fusion Engine — visibilidad de descartados/duplicados por fuente, ausente hasta ahora del panel. */
export type SourceIngestionCounts = {
  sourceId: string;
  recordsFetched: number;
  recordsInserted: number;
  recordsUpdated: number;
  recordsSkipped: number;
  lastStatus: string | null;
  lastRunAt: string | null;
};

/** Incidentes maestros activos generados por `masterIncidentEngine.ts` (correlación cross-amenaza). */
export type MasterIncidentHealth = {
  activeParents: number;
  totalChildRelations: number;
};

/** Recomendaciones de módulo recientes (`moduleActivationEngine.ts`), registradas en `AuditLog`. */
export type ModuleActivationHealth = {
  recentRecommendationsCount: number;
  recent: Array<{ incidentId: string; modules: string[]; createdAt: string }>;
};

export type OperationalHealthSnapshot = {
  generatedAt: string;
  overallStatus: OperationalHealthStatus;
  platform: ComponentHealth;
  persistence: ComponentHealth;
  distributedBackend: ComponentHealth;
  pipelines: PipelineHealth[];
  sources: SourcesComponentHealth;
  sourceIngestionCounts: SourceIngestionCounts[];
  notifications: ComponentHealth;
  projections: ComponentHealth;
  modules: ComponentHealth;
  masterIncidents: MasterIncidentHealth;
  moduleActivations: ModuleActivationHealth;
  activeIssues: OperationalIssue[];
};
