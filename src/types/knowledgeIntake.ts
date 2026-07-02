export type ArgusHazardDomain =
  | "natural_disaster"
  | "earthquake"
  | "tsunami"
  | "volcano"
  | "flood"
  | "storm"
  | "hurricane"
  | "tornado"
  | "landslide"
  | "avalanche"
  | "drought"
  | "heatwave"
  | "coldwave"
  | "wildfire"
  | "urban_fire"
  | "industrial_fire"
  | "transport_accident"
  | "road_accident"
  | "rail_accident"
  | "aviation_accident"
  | "maritime_accident"
  | "pipeline_accident"
  | "chemical_accident"
  | "industrial_accident"
  | "explosion"
  | "mining_accident"
  | "dam_failure"
  | "bridge_collapse"
  | "building_collapse"
  | "power_grid_failure"
  | "telecom_failure"
  | "water_system_failure"
  | "nuclear_radiological"
  | "biological_hazard"
  | "public_health"
  | "mass_gathering_incident"
  | "civil_unrest"
  | "conflict_zone"
  | "humanitarian_crisis"
  | "unknown";

export type ArgusHazardSubtype = string;

export type ArgusKnowledgeInputType =
  | "api_rest"
  | "rss_atom"
  | "csv"
  | "json"
  | "geojson"
  | "xml"
  | "html"
  | "pdf"
  | "docx"
  | "txt_markdown"
  | "xlsx"
  | "kml_kmz"
  | "shapefile_planned"
  | "citizen_report"
  | "manual_admin"
  | "url"
  | "document_folder"
  | "downloaded_dataset"
  | "scanned_document_planned"
  | "image_map_planned";

export type ArgusKnowledgeIngestionMode =
  | "automatic"
  | "manual"
  | "scheduled"
  | "adminUpload"
  | "userReport"
  | "bulkImport";

export type ArgusKnowledgeProcessingStatus =
  | "received"
  | "queued"
  | "parsing"
  | "normalized"
  | "needsReview"
  | "failed"
  | "published";

export type ArgusKnowledgeSourceStatus =
  | "active"
  | "planned"
  | "manual"
  | "disabled"
  | "requiresReview";

export type ArgusKnowledgeSourceKind =
  | "live"
  | "near_real_time"
  | "historical"
  | "doctrinal"
  | "technical"
  | "scientific"
  | "local_chile"
  | "citizen"
  | "manual"
  | "future_admin";

export type ArgusKnowledgeLicenseType =
  | "openAccess"
  | "publicDomain"
  | "nonCommercial"
  | "requiresAttribution"
  | "restricted"
  | "unknown"
  | "manualReviewRequired";

export type ArgusIncidentSeverity = "low" | "medium" | "high" | "critical" | "unknown";

export type ArgusKnowledgeCoverage = {
  countries?: string[];
  regions?: string[];
  global?: boolean;
  notes?: string;
};

export type ArgusSourceReliabilityScore = {
  authorityScore: number;
  freshnessScore: number;
  technicalDepthScore: number;
  historicalAccuracyScore: number;
  geospatialPrecisionScore: number;
  licenseClarityScore: number;
  updateCadenceScore: number;
  biasRiskScore: number;
  finalScore: number;
  label: "official_priority" | "trusted_secondary" | "needs_validation" | "context_only" | "not_operational";
};

export type ArgusEvidenceConfidenceScore = {
  sourceReliability: number;
  corroborationCount: number;
  geolocationPrecision: number;
  timestampPrecision: number;
  documentQuality: number;
  extractionConfidence: number;
  conflictWithOtherSources: number;
  finalConfidence: number;
  label: "high" | "medium" | "low" | "not_operational";
};

export type ArgusKnowledgeSource = {
  id: string;
  name: string;
  description: string;
  status: ArgusKnowledgeSourceStatus;
  sourceKinds: ArgusKnowledgeSourceKind[];
  domains: ArgusHazardDomain[];
  inputTypes: ArgusKnowledgeInputType[];
  accessMethod: "api" | "feed" | "download" | "manual" | "document" | "dataset" | "planned";
  baseUrl?: string;
  coverage: ArgusKnowledgeCoverage;
  reliabilityScore: ArgusSourceReliabilityScore;
  licenseType: ArgusKnowledgeLicenseType;
  licenseNotes: string;
  updateCadence?: string;
  integrationNotes: string;
  tags: string[];
};

export type ArgusKnowledgeInputEnvelope = {
  id: string;
  inputType: ArgusKnowledgeInputType;
  sourceId?: string;
  sourceName?: string;
  sourceUrl?: string;
  fileName?: string;
  fileMimeType?: string;
  uploadedBy?: string;
  ingestionMode: ArgusKnowledgeIngestionMode;
  rawContentRef?: string;
  rawText?: string;
  rawMetadata?: Record<string, unknown>;
  language?: string;
  country?: string;
  coverage?: ArgusKnowledgeCoverage;
  licenseNotes?: string;
  receivedAt: string;
  processingStatus: ArgusKnowledgeProcessingStatus;
  errorLog?: ArgusKnowledgeProcessingError[];
  tags: string[];
};

export type ArgusKnowledgeIngestionRun = {
  id: string;
  sourceId: string;
  startedAt: string;
  completedAt?: string;
  status: ArgusKnowledgeProcessingStatus;
  inputCount: number;
  normalizedCount: number;
  reviewCount: number;
  errors: ArgusKnowledgeProcessingError[];
};

export type ArgusKnowledgeRawDocument = {
  id: string;
  envelopeId: string;
  sourceId?: string;
  contentRef?: string;
  rawText?: string;
  rawMetadata?: Record<string, unknown>;
  sha256?: string;
  receivedAt: string;
};

export type ArgusKnowledgeParsedDocument = {
  id: string;
  rawDocumentId: string;
  title?: string;
  text: string;
  chunks: string[];
  language?: string;
  extractedAt: string;
  extractionConfidence: number;
  needsOcr: boolean;
  metadata: Record<string, unknown>;
};

export type ArgusKnowledgeEvidenceItem = {
  id: string;
  incidentId?: string;
  sourceId: string;
  sourceName: string;
  title: string;
  url?: string;
  quote?: string;
  summary: string;
  confidenceScore: ArgusEvidenceConfidenceScore;
  locationConfidence: number;
  timestampConfidence: number;
  extractedAt: string;
  conflicts?: string[];
};

export type ArgusCasualties = {
  fatalities?: number;
  injured?: number;
  missing?: number;
  displaced?: number;
  unknownText?: string;
};

export type ArgusIncidentImpact = {
  peopleAffected?: number;
  homesAffected?: number;
  infrastructureAffected?: string[];
  economicLossText?: string;
  environmentalImpact?: string;
};

export type ArgusIncidentTechnicalFactors = {
  speedKmh?: number;
  impactType?: string;
  vehicleType?: string;
  collisionObject?: string;
  fireBehavior?: string;
  fuelType?: string;
  flameSpread?: string;
  smokeRisk?: string;
  radiationDose?: string;
  isotope?: string;
  chemicalAgent?: string;
  toxicityClass?: string;
  explosionType?: string;
  weatherConditions?: string;
  windDirection?: string;
  windSpeed?: string;
  slope?: string;
  vegetationType?: string;
  buildingType?: string;
  structuralFailureMode?: string;
  infrastructureAffected?: string;
  evacuationComplexity?: string;
  exposedPopulation?: number;
  hospitalLoadRisk?: string;
  roadClosureRisk?: string;
  routeDisruptionRisk?: string;
  magnitude?: number;
  depthKm?: number;
  burnedAreaHa?: number;
  waveHeightM?: number;
};

export type ArgusLessonLearned = {
  id: string;
  title: string;
  domain: ArgusHazardDomain;
  sourceIncidentId: string;
  sourceName: string;
  summary: string;
  whatFailed: string[];
  whatWorked: string[];
  earlyWarningSignals: string[];
  recommendedPreventiveActions: string[];
  recommendedResponseActions: string[];
  applicableToChile: boolean;
  confidenceScore: number;
  tags: string[];
};

export type ArgusOperationalRecommendation = {
  id: string;
  audience: "citizen" | "institutional" | "medical" | "routing" | "simulation";
  priority: "low" | "medium" | "high" | "critical";
  text: string;
  rationale: string;
  confidenceScore: number;
  safetyLimit: string;
  requiresHumanValidation: boolean;
};

export type ArgusIncidentKnowledge = {
  id: string;
  title: string;
  summary: string;
  domain: ArgusHazardDomain;
  subtype?: ArgusHazardSubtype;
  severity: ArgusIncidentSeverity;
  confidenceScore: number;
  actionabilityScore: number;
  sourceReliabilityScore: number;
  evidenceCount: number;
  sourceIds: string[];
  sourceNames: string[];
  occurredAt?: string;
  detectedAt?: string;
  country?: string;
  region?: string;
  locality?: string;
  latitude?: number;
  longitude?: number;
  geometry?: Record<string, unknown>;
  casualties?: ArgusCasualties;
  impact?: ArgusIncidentImpact;
  technicalFactors: ArgusIncidentTechnicalFactors;
  causes: string[];
  contributingFactors: string[];
  responseActions: string[];
  lessonsLearned: ArgusLessonLearned[];
  recommendedActions: ArgusOperationalRecommendation[];
  relatedHistoricalEvents: string[];
  similarIncidentIds: string[];
  tags: string[];
  language?: string;
  rawEvidenceRefs: string[];
  createdAt: string;
  updatedAt: string;
};

export type ArgusKnowledgeEmbeddingRecord = {
  id: string;
  ownerType: "incident" | "lesson" | "document" | "evidence";
  ownerId: string;
  text: string;
  vectorRef?: string;
  provider?: string;
  createdAt: string;
};

export type ArgusKnowledgeProcessingError = {
  id: string;
  stage: string;
  message: string;
  severity: "info" | "warning" | "error";
  recoverable: boolean;
  createdAt: string;
};

export type ArgusKnowledgeAdminReview = {
  id: string;
  itemType: "source" | "document" | "incident" | "evidence" | "lesson";
  itemId: string;
  status: "pending" | "approved" | "rejected" | "needs_more_data";
  reviewerId?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
};

export type ArgusKnowledgeImportTemplate = {
  id: string;
  name: string;
  inputType: ArgusKnowledgeInputType;
  requiredFields: string[];
  optionalFields: string[];
  example: Record<string, unknown>;
};

export type ArgusOperationalReasoningResult = {
  severity: ArgusIncidentSeverity;
  secondaryRisks: string[];
  escalationProbability: number;
  exposedPopulationEstimate?: number;
  nearbyCriticalInfrastructure: string[];
  affectedRoutes: string[];
  citizenRecommendation: ArgusOperationalRecommendation;
  institutionalRecommendation: ArgusOperationalRecommendation;
  informationNeeds: string[];
  confidenceScore: number;
  limits: string[];
};

export type ArgusIncidentSimilarityResult = {
  incident: ArgusIncidentKnowledge;
  similarityScore: number;
  matchedFactors: string[];
  warningText: string;
};
