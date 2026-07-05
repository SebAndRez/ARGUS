import type { UserMode } from "@/lib/source-governance/sourceRoles";

export type MapLayerGroup =
  | "core"
  | "live_incidents"
  | "official_alerts"
  | "observed_reality"
  | "forecast_models"
  | "impact_enrichment"
  | "infrastructure_context"
  | "historical_memory"
  | "osint_signals"
  | "health"
  | "earthquake"
  | "flood"
  | "volcano"
  | "weather_cyclone"
  | "tsunami_coastal"
  | "nav"
  | "aura"
  | "fenix"
  | "command_center";

export type MapLayerMode = Extract<UserMode, "citizen" | "command_center" | "analyst" | "fenix" | "nav" | "aura" | "risk">;

export interface MapLayerPolicy {
  layerId: string;
  sourceId: string;
  group: MapLayerGroup;
  label: string;
  defaultVisibleCitizen: boolean;
  defaultVisibleCommandCenter: boolean;
  defaultVisibleAnalyst: boolean;
  visibleInModes: MapLayerMode[];
  requiresActiveIncident?: boolean;
  requiresSelectedIncident?: boolean;
  requiresAoi?: boolean;
  maxZoomHint?: number;
  minZoomHint?: number;
  caveats: string[];
  legendType: "point" | "polygon" | "raster" | "timeline" | "panel" | "hybrid";
  priority: number;
  badges?: string[];
}

export const MAP_LAYER_GROUP_LABELS: Record<MapLayerGroup, string> = {
  core: "Core",
  live_incidents: "Live Incidents",
  official_alerts: "Official Alerts",
  observed_reality: "Observed Reality",
  forecast_models: "Forecast Models",
  impact_enrichment: "Impact Enrichment",
  infrastructure_context: "Infrastructure Context",
  historical_memory: "Historical Memory",
  osint_signals: "OSINT Signals",
  health: "Health",
  earthquake: "Earthquake",
  flood: "Flood",
  volcano: "Volcano",
  weather_cyclone: "Weather/Cyclone",
  tsunami_coastal: "Tsunami/Coastal",
  nav: "NAV",
  aura: "AURA",
  fenix: "Fenix",
  command_center: "Command Center",
};
