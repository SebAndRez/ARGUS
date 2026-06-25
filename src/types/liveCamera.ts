export type LiveCameraProvider =
  | "youtube"
  | "earthcam"
  | "skylinewebcams"
  | "earthtv"
  | "other";

export type LiveCameraStatus =
  | "active"
  | "embed_restricted"
  | "unknown"
  | "needs_review";

export type LiveCameraLocationPrecision =
  | "exact"
  | "approximate"
  | "city"
  | "unknown";

export type LiveCameraCategory =
  | "capital"
  | "landmark"
  | "street"
  | "airport"
  | "port"
  | "city"
  | "beach"
  | "tourism"
  | "stadium"
  | "border"
  | "border_or_sensitive_area"
  | "mountain"
  | "coast"
  | "wildlife"
  | "transport"
  | "rail"
  | "volcano"
  | "space"
  | "weather"
  | "needs_review"
  | "religious"
  | "other";

export interface ArgusLiveCamera {
  id: string;
  title: string;
  provider: LiveCameraProvider;
  city?: string;
  region?: string;
  country?: string;
  latitude: number;
  longitude: number;
  lat?: number;
  lng?: number;
  locationPrecision: LiveCameraLocationPrecision;
  locationConfidence: number;
  sourceUrl: string;
  providerName?: string;
  videoId?: string;
  embedUrl?: string;
  embedAllowed: boolean;
  embedStatus?: "allowed" | "restricted" | "unknown";
  status: LiveCameraStatus;
  markerLabel: string;
  category: LiveCameraCategory;
  tags: string[];
  strategicTags?: string[];
  description?: string;
  operationalValue?: "low" | "medium" | "high" | "needs_review";
  notes?: string;
}
