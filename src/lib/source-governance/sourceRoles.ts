export type SourceRole =
  | "incident_trigger"
  | "observed_context"
  | "forecast_signal"
  | "impact_enrichment"
  | "baseline_context"
  | "historical_memory"
  | "osint_signal";

export type QueryMode =
  | "global_polling"
  | "event_enrichment"
  | "aoi_only"
  | "manual_import"
  | "on_demand"
  | "disabled_until_configured";

export type VisibilityScope =
  | "citizen_default"
  | "citizen_event_detail"
  | "command_center"
  | "analyst"
  | "fenix"
  | "nav"
  | "aura"
  | "risk_engine"
  | "hidden";

export type SourceAction =
  | "create_incident"
  | "create_candidate"
  | "update_incident"
  | "create_evidence"
  | "create_context"
  | "update_risk"
  | "render_layer"
  | "manual_import";

export type RequiredSourceContext =
  | "event"
  | "aoi"
  | "bbox"
  | "point"
  | "route"
  | "simulation"
  | "incident";

export type PersistenceMode =
  | "always"
  | "event_related"
  | "aoi_related"
  | "manual_import"
  | "never";

export interface SourceGovernancePolicy {
  sourceId: string;
  sourceName?: string;
  sourceRole: SourceRole;
  secondaryRoles?: SourceRole[];
  queryMode: QueryMode;

  canCreateIncident: boolean;
  canCreateIncidentWithGuardrails: boolean;
  canCreateCandidate: boolean;
  canUpdateIncident: boolean;
  canCreateEvidence: boolean;
  canCreateContext: boolean;
  canUpdateRisk: boolean;

  citizenVisibleByDefault: boolean;
  citizenVisibleOnIncidentDetail: boolean;
  commandCenterVisible: boolean;
  analystVisible: boolean;
  fenixVisible: boolean;
  navVisible: boolean;
  auraVisible: boolean;

  runAllDefault: boolean;
  runAllAllowedWithFlag: boolean;
  requiresReviewByDefault: boolean;
  requiresConfiguration: boolean;

  defaultPersistence: "always" | "event_related" | "manual_import" | "none";
  persistenceMode?: PersistenceMode;
  maxPollingWindowHours?: number;
  minSeverityForCitizen?: string;
  requiredContext?: RequiredSourceContext[];

  riskWeight: number;
  confidenceBase: number;

  caveats: string[];
  forbiddenActions: SourceAction[];
  allowedActions: SourceAction[];
}

export type UserMode =
  | "citizen"
  | "authenticated_citizen"
  | "analyst"
  | "command_center"
  | "admin"
  | "fenix"
  | "nav"
  | "aura"
  | "risk";

export interface SourceContextState {
  hasActiveIncident?: boolean;
  hasSelectedIncident?: boolean;
  hasAoi?: boolean;
  hasBbox?: boolean;
  hasPoint?: boolean;
  hasRoute?: boolean;
  hasSimulation?: boolean;
  isOfficiallyConfirmed?: boolean;
  isValidated?: boolean;
  severity?: string;
}
