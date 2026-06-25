export type HazardKnowledgeType =
  | "historical_event"
  | "doctrine"
  | "threshold"
  | "case_study"
  | "source_note";

export type HazardType =
  | "tsunami"
  | "earthquake"
  | "fire"
  | "flood"
  | "volcano"
  | "humanitarian"
  | "conflict"
  | "weather"
  | "disaster"
  | "climate"
  | "evacuation"
  | "emergency_response"
  | "geology"
  | "infrastructure"
  | "exposure"
  | "paleotsunami"
  | "preparedness"
  | "resilience"
  | "health_response"
  | "chemical"
  | "nuclear"
  | "radiological"
  | "industrial";

export type HazardDocumentCategory =
  | "scientific_paper"
  | "historical_archive"
  | "institutional_manual"
  | "emergency_plan"
  | "evacuation_plan"
  | "health_response"
  | "risk_atlas"
  | "education"
  | "technical_report"
  | "local_emergency_doc"
  | "academic_report"
  | "article"
  | "case_study"
  | "doctrine"
  | "other";

export type HazardKnowledgeIngestionStatus =
  | "queued"
  | "seeded"
  | "manual_review"
  | "partially_extracted"
  | "extracted"
  | "rejected";

export interface HazardKnowledgeFact {
  id: string;
  hazardType: HazardType;
  knowledgeType: HazardKnowledgeType;
  title: string;
  summary: string;
  country?: string;
  region?: string;
  latitude?: number;
  longitude?: number;
  year?: number;
  eventDate?: string;
  magnitude?: number;
  magnitudeLabel?: string;
  depthKm?: number;
  ruptureLengthKm?: number;
  maxSeaLevelVariationM?: number;
  affectedCoastKm?: number;
  casualtiesText?: string;
  sourceName: string;
  sourceUrl: string;
  confidence: number;
  tags: string[];
  documentId?: string;
  documentCategory?: HazardDocumentCategory | string;
  extractionStatus?: HazardKnowledgeIngestionStatus | string;
  limitationNote?: string;
  relevanceScore?: number;
}

export interface HazardKnowledgeDocumentSummary {
  id: string;
  title: string;
  sourceName: string;
  sourceUrl: string;
  publisher?: string;
  country?: string;
  hazardType: string;
  language?: string;
  publishedYear?: number;
  notes?: string;
  documentCategory?: HazardDocumentCategory | string;
  ingestionStatus?: HazardKnowledgeIngestionStatus | string;
  priority?: number;
  reliabilityScore?: number;
  institution?: string;
  countryFocus?: string;
  regionFocus?: string;
  hazardTypes?: string[];
  tags?: string[];
  limitationNote?: string;
}
