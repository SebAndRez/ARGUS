/**
 * ARGUS ARCA: refugios, zonas seguras, capacidad, servicios, accesibilidad y
 * disponibilidad. ARCA gestiona refugios y capacidad operacional — no
 * implementa logística profunda (NEXUS), routing avanzado (HERMES) ni
 * triage/mando sanitario (AURA), y nunca promete seguridad absoluta.
 */

export type ArcaShelterStatus = "active" | "standby" | "full" | "over_capacity" | "limited" | "closed" | "unknown";

export type ArcaShelterType =
  | "public_shelter"
  | "school"
  | "sports_center"
  | "community_center"
  | "church"
  | "municipal_building"
  | "medical_shelter"
  | "temporary_camp"
  | "evacuation_point"
  | "safe_zone"
  | "other";

export type ArcaCapacityStatus = "available" | "limited" | "near_full" | "full" | "over_capacity" | "unknown";

export type ArcaServiceStatus = "available" | "limited" | "unavailable" | "unknown";

export type ArcaConfidence = "unknown" | "low" | "medium" | "high" | "verified";

export interface ArcaGeoPoint {
  lat: number;
  lng: number;
  label?: string;
  accuracyMeters?: number;
  isApproximate?: boolean;
}

export interface ArcaShelterServices {
  water: ArcaServiceStatus;
  food: ArcaServiceStatus;
  electricity: ArcaServiceStatus;
  bathrooms: ArcaServiceStatus;
  showers: ArcaServiceStatus;
  heating: ArcaServiceStatus;
  internet: ArcaServiceStatus;
  phoneCharging: ArcaServiceStatus;
  medicalPoint: ArcaServiceStatus;
  psychologicalSupport: ArcaServiceStatus;
  security: ArcaServiceStatus;
  childFriendlyArea: ArcaServiceStatus;
  petFriendly: ArcaServiceStatus;
}

export interface ArcaAccessibility {
  wheelchairAccessible: boolean | "unknown";
  reducedMobilitySupport: boolean | "unknown";
  elderlySupport: boolean | "unknown";
  childSupport: boolean | "unknown";
  petSupport: boolean | "unknown";
  vehicleAccess: boolean | "unknown";
  publicTransportAccess: boolean | "unknown";
}

export type ArcaShelterNeedType =
  | "water"
  | "food"
  | "medicine"
  | "blankets"
  | "fuel"
  | "electricity"
  | "sanitation"
  | "medical_staff"
  | "security"
  | "transport"
  | "volunteers"
  | "pet_supplies"
  | "other";

export interface ArcaShelterNeed {
  id: string;
  type: ArcaShelterNeedType;
  priority: "low" | "medium" | "high" | "critical";
  quantityNeeded?: number;
  unit?: string;
  description: string;
  status: "open" | "partially_fulfilled" | "fulfilled" | "cancelled";
  createdAt: string;
  updatedAt: string;
}

export type ArcaShelterRestrictionType =
  | "no_pets"
  | "medical_only"
  | "families_priority"
  | "capacity_limited"
  | "access_restricted"
  | "requires_registration"
  | "unknown";

export interface ArcaShelterRestriction {
  id: string;
  type: ArcaShelterRestrictionType;
  description: string;
}

export interface ArcaShelter {
  id: string;
  name: string;
  type: ArcaShelterType;
  status: ArcaShelterStatus;
  capacityStatus: ArcaCapacityStatus;
  location: ArcaGeoPoint;
  addressLabel?: string;
  operator?: {
    name: string;
    type: "municipal" | "government" | "ngo" | "private" | "community" | "unknown";
    contactPublic?: string;
  };
  capacity: {
    total?: number;
    currentOccupancy?: number;
    available?: number;
    lastUpdatedAt?: string;
    isEstimated: boolean;
  };
  services: ArcaShelterServices;
  accessibility: ArcaAccessibility;
  restrictions?: ArcaShelterRestriction[];
  needs: ArcaShelterNeed[];
  linkedReports: string[];
  linkedTalosAssessments: string[];
  linkedHermesRoutes: string[];
  linkedEvidence: string[];
  confidence: ArcaConfidence;
  publicNotes?: string;
  internalNotes?: string;
  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;
  isPublic?: boolean;
}

export interface ArcaOperationalEvaluation {
  status: ArcaShelterStatus;
  capacityStatus: ArcaCapacityStatus;
  serviceScore: number;
  confidence: ArcaConfidence;
  warnings: string[];
  reasons: string[];
}

export interface ArcaShelterSuitabilityContext {
  userLocation?: ArcaGeoPoint;
  eventType?: string;
  needsMedicalSupport?: boolean;
  hasPets?: boolean;
  reducedMobility?: boolean;
  familyWithChildren?: boolean;
  talosRiskLevelNearby?: string;
  hermesRouteAvailable?: boolean;
}

export type ArcaSuitabilityLabel = "recommended" | "usable" | "limited" | "not_recommended" | "unknown";

export interface ArcaShelterSuitabilityResult {
  score: number;
  label: ArcaSuitabilityLabel;
  reasons: string[];
  warnings: string[];
}

export type ArcaFeature =
  | "view_public_shelters"
  | "view_nearby_shelters"
  | "view_capacity_public"
  | "view_detailed_capacity"
  | "view_internal_notes"
  | "view_needs"
  | "manage_shelter_status"
  | "update_capacity"
  | "update_services"
  | "create_shelter"
  | "send_to_hermes"
  | "send_to_nexus"
  | "send_to_atlas"
  | "export_shelter_report";

export interface ArcaAtlasSummary {
  activeShelters: number;
  estimatedTotalCapacity: number;
  estimatedOccupancy: number;
  availableCapacity: number;
  criticalNeeds: number;
  saturatedShelters: number;
  sheltersWithIssues: number;
  sheltersWithMedicalPoint: number;
  lastUpdatedIso: string | null;
}

export interface ArcaHermesCandidate {
  shelterId: string;
  destination: ArcaGeoPoint;
  capacityStatus: ArcaCapacityStatus;
  restrictions: ArcaShelterRestriction[];
  priority: "low" | "medium" | "high" | "critical";
  warnings: string[];
}

export interface ArcaTalosDemandSignal {
  assessmentId: string;
  riskLevel: string;
  category: string;
  confidence: string;
  possibleEvacuationNeed: boolean;
  shelterPriority: "low" | "medium" | "high" | "critical";
  approximateZone?: ArcaGeoPoint;
}

export interface ArcaAuraMedicalSignal {
  shelterId: string;
  hasMedicalPoint: boolean;
  suitableForPrimaryCare: boolean;
  requiresAuraReferral: boolean;
}

export interface ArcaNexusNeedSignal {
  shelterId: string;
  needId: string;
  type: ArcaShelterNeedType;
  priority: "low" | "medium" | "high" | "critical";
  quantityNeeded?: number;
  unit?: string;
  status: ArcaShelterNeed["status"];
  approximateZone?: ArcaGeoPoint;
}

export interface ArcaFenixSheltersPacket {
  totalCapacity: number;
  estimatedOccupancy: number;
  availableShelterIds: string[];
  saturatedShelterIds: string[];
  geographicDistribution: ArcaGeoPoint[];
  criticalServices: string[];
  missingData: string[];
}
