export type IngestJobStatus =
  | "IDLE"
  | "RUNNING"
  | "SUCCESS"
  | "PARTIAL_SUCCESS"
  | "FAILED"
  | "DISABLED"
  | "DEMO_ONLY";

export interface IngestJobDefinition {
  id: string;
  sourceId: string;
  name: string;
  enabled: boolean;
  intervalMinutes: number;
  timeoutMs: number;
  maxRetries: number;
  backoffSeconds: number;
  lastRunAt?: string | null;
  lastSuccessAt?: string | null;
  lastError?: string | null;
  status?: IngestJobStatus;
}
