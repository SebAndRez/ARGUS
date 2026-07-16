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

export type OperationalHealthSnapshot = {
  generatedAt: string;
  overallStatus: OperationalHealthStatus;
  platform: ComponentHealth;
  persistence: ComponentHealth;
  distributedBackend: ComponentHealth;
  pipelines: PipelineHealth[];
  sources: SourcesComponentHealth;
  notifications: ComponentHealth;
  projections: ComponentHealth;
  modules: ComponentHealth;
  activeIssues: OperationalIssue[];
};
