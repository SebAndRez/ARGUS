export type VisualSourceCategory =
  | "governmental_osint"
  | "institutional_camera"
  | "open_public_camera"
  | "commercial_webcam"
  | "media_stream"
  | "citizen_stream"
  | "argus_verified_sensor"
  | "unverified_source";

export type VisualSourceStatus = "live" | "offline" | "external_only" | "embed_restricted";

export type VisualSourceLocationPrecision = "exact" | "venue" | "city" | "country" | "unknown";

export interface VisualSource {
  id: string;
  title: string;
  sourceName: string;
  category: VisualSourceCategory;
  status: VisualSourceStatus;
  latitude: number;
  longitude: number;
  locationName: string;
  locationPrecision: VisualSourceLocationPrecision;
  locationConfidence: number;
  sourceUrl: string;
  embedUrl?: string | null;
  embedAllowed: boolean;
  isMutedPreview?: boolean;
  description?: string;
  lastUpdatedLabel?: string;
  internalNotes?: string;
  tags?: string[];
}
