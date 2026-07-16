import type { CrisisEvent, EventSeverity, EventType } from "@/types/crisis";

export type IncidentType =
  | "earthquake"
  | "tsunami"
  | "fire"
  | "weather"
  | "humanitarian"
  | "citizen_report"
  | "sos"
  | "medical"
  | "earthquake_sensor"
  | "mobile_safety"
  | "infrastructure"
  | "conflict"
  | "unknown";

export type IncidentStatus =
  | "NEW"
  | "VERIFYING"
  | "ARGUS_HYPOTHESIS"
  | "OFFICIAL_CONFIRMED"
  | "MONITORING"
  | "CLOSED"
  | "DISMISSED";

export type IncidentPriority =
  | "P0_CRITICAL"
  | "P1_HIGH"
  | "P2_MEDIUM"
  | "P3_LOW"
  | "P4_INFO";

export type IncidentSeverity = EventSeverity | "INFO";

export type EvidenceSourceType =
  | "OFFICIAL"
  | "TECHNICAL"
  | "CITIZEN"
  | "SENSOR_SAFETY"
  | "CAMERA"
  | "WEATHER"
  | "HISTORICAL"
  | "ARGUS_RULE";

export type EvidenceKind =
  | "EVENT_DETECTION"
  | "CITIZEN_REPORT"
  | "OFFICIAL_ALERT"
  | "WEATHER_CONTEXT"
  | "CAMERA_AVAILABLE"
  | "HISTORICAL_CONTEXT"
  | "CORRELATION"
  | "SENSOR_SHAKE_PATTERN"
  | "SAFETY_CHECK"
  | "POSSIBLE_VEHICLE_CRASH"
  | "POSSIBLE_FALL"
  | "NO_RESPONSE_CHECK_IN"
  | "USER_NEEDS_HELP"
  | "USER_SAFE"
  | "STATUS_UPDATE";

/**
 * ARGUS v1.0.3.4 — structural classification for every incident this API
 * surface can return (see docs/product/ARGUS_COMMAND_CENTER_STATUS.md).
 * `/api/incidents` and `/api/command/overview` have no real operational
 * source connected today (no Prisma, no KnowledgeIncident, no Global
 * Watch) — every value they can produce is one of the other three.
 * `"operational"` exists as a forward-looking value for when a real,
 * persisted, validated source is eventually connected; nothing in this
 * codebase constructs it today.
 */
export type IncidentDataMode =
  | "operational"
  | "synthetic"
  | "demo"
  | "runtime_placeholder";

export type Incident = {
  id: string;
  title: string;
  type: IncidentType;
  subtype?: string;
  status: IncidentStatus;
  priority: IncidentPriority;
  severity: IncidentSeverity;
  /**
   * Whether `severity`/`priority` above reflect a real operational
   * assessment or a simulated/demo value shown for presentation only.
   * Never "operational" while `dataMode !== "operational"`.
   */
  severityMode: "operational" | "simulated";
  confidence: number;
  locationLat: number;
  locationLng: number;
  radiusKm?: number;
  country?: string;
  region?: string;
  sourceSummary: string;
  argusSummary: string;
  recommendedAction: string;
  officialStatus?: string;
  createdAt: string;
  updatedAt: string;
  lastEvidenceAt?: string;
  closedAt?: string;
  isDemo?: boolean;
  /** Structural classification — see `IncidentDataMode` above. */
  dataMode: IncidentDataMode;
  /**
   * False for anything backed only by an in-memory/`globalThis` store or a
   * hardcoded demo fixture — true only once a real persisted source exists.
   * Always false today.
   */
  persistent: boolean;
};

export type IncidentEvidence = {
  id: string;
  incidentId: string;
  sourceType: EvidenceSourceType;
  sourceId?: string;
  sourceName: string;
  evidenceKind: EvidenceKind;
  reliability: number;
  confidenceImpact: number;
  title: string;
  summary: string;
  url?: string;
  observedAt: string;
  createdAt: string;
  rawRef?: string;
};

export type IncidentTimelineEntry = {
  id: string;
  incidentId: string;
  entryType:
    | "CREATED"
    | "EVIDENCE_ADDED"
    | "PRIORITY_CHANGED"
    | "STATUS_CHANGED"
    | "ARGUS_UPDATED"
    | "OFFICIAL_UPDATE"
    | "CLOSED";
  title: string;
  summary: string;
  source: string;
  createdAt: string;
};

export type IncidentLink = {
  id: string;
  incidentId: string;
  linkedType:
    | "EXTERNAL_EVENT"
    | "REPORT"
    | "RISK_ASSESSMENT"
    | "CAMERA"
    | "KNOWLEDGE_FACT";
  linkedId: string;
  relation:
    | "CAUSED_BY"
    | "RELATED_TO"
    | "CONFIRMS"
    | "CONTRADICTS"
    | "CONTEXT_FOR"
    | "VISUAL_SOURCE";
  createdAt: string;
};

export type IncidentPriorityExplanation = {
  priority: IncidentPriority;
  score: number;
  reasons: string[];
  limitations: string[];
};

export type IncidentCommandView = Incident & {
  evidence: IncidentEvidence[];
  timeline: IncidentTimelineEntry[];
  links: IncidentLink[];
  priorityExplanation: IncidentPriorityExplanation;
  recommendedActions: string[];
  limitations: string[];
};

export type SourceHealthStatus =
  | "ACTIVE"
  | "DEGRADED"
  | "STALE"
  | "DISABLED"
  | "UNKNOWN";

export type CommandSourceHealth = {
  sourceId: string;
  name: string;
  status: SourceHealthStatus;
  lastSeenAt?: string;
  lastSuccessfulRunAt?: string;
  lastError?: string;
  freshnessLabel: string;
};

export type CommandOverview = {
  totalActiveIncidents: number;
  priorityCounts: Record<IncidentPriority, number>;
  sourceCounts: Record<SourceHealthStatus, number>;
  topIncidents: IncidentCommandView[];
  systemAlerts: string[];
  updatedAt: string;
};

export type IncidentInputEvent = Pick<
  CrisisEvent,
  "id" | "title" | "category" | "description" | "latitude" | "longitude" | "severity" | "type" | "status" | "createdAt" | "confidence"
> & {
  sourceName?: string;
  eventType?: EventType;
};
