export type LiveCameraProvider =
  | "youtube"
  | "earthcam"
  | "skylinewebcams"
  | "earthtv"
  | "other";

export type LiveCameraStatus = "active" | "embed_restricted" | "unknown";

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
  | "stadium"
  | "border"
  | "mountain"
  | "coast"
  | "wildlife"
  | "transport"
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
  locationPrecision: LiveCameraLocationPrecision;
  locationConfidence: number;
  sourceUrl: string;
  embedUrl?: string;
  embedAllowed: boolean;
  status: LiveCameraStatus;
  markerLabel: string;
  category: LiveCameraCategory;
  tags: string[];
  notes?: string;
}
