export type OfflineQueuePriority = "SOS" | "CHECK_IN" | "SENSOR_EVENT" | "REPORT" | "LOW";
export type OfflineQueueStatus = "PENDING" | "RETRYING" | "SENT" | "EXPIRED" | "FAILED";

export interface OfflineQueueItem {
  id: string;
  type: "mobile_event" | "safety_check" | "sos" | "report";
  priority: OfflineQueuePriority;
  status: OfflineQueueStatus;
  createdAt: string;
  expiresAt: string;
  retryCount: number;
  maxRetries: number;
  encryptedLocalPayload: boolean;
  dedupeKey: string;
  endpoint: string;
}
