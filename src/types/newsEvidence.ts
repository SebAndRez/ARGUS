export type NewsEvidenceSourceTier =
  | "official"
  | "technical"
  | "major_media"
  | "osint"
  | "citizen"
  | "unknown";

export interface NewsEvidence {
  id: string;
  sourceName: string;
  sourceTier: NewsEvidenceSourceTier;
  title: string;
  url: string;
  publishedAt: string;
  country?: string;
  region?: string;
  lat?: number;
  lng?: number;
  summary: string;
  linkedEventId?: string;
  linkedZoneId?: string;
  confidence: "low" | "medium" | "high";
}
