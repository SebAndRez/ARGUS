import type { ArgusRole } from "@/types/rbac";

export type AuraBloodType = "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-" | "unknown" | "prefer_not_to_say";
export type AuraMedicalVisibility = "private" | "emergency_only" | "medical_staff_only" | "institutional_aggregated";
export type AuraMedicalUrgency = "low" | "medium" | "high" | "critical";
export type AuraMedicalPointStatus = "active" | "limited" | "saturated" | "closed" | "unknown";
export type AuraConfidence = "unknown" | "low" | "medium" | "high" | "verified";
export type AuraCapacityStatus = "available" | "limited" | "saturated" | "unknown";

export type AuraEmergencyContact = {
  id: string;
  name: string;
  relationship?: string;
  phone?: string;
  email?: string;
  priority: number;
  canReceiveEmergencyAlert: boolean;
};

export type AuraMedicalProfile = {
  userId: string;
  bloodType?: AuraBloodType;
  allergies?: string[];
  chronicConditions?: string[];
  medications?: string[];
  emergencyNotes?: string;
  emergencyContact?: AuraEmergencyContact;
  visibility: AuraMedicalVisibility;
  consentUpdatedAt?: string;
  isComplete: boolean;
  updatedAt: string;
};

export type AuraMedicalServices = {
  firstAid: boolean | "unknown";
  emergencyCare: boolean | "unknown";
  triage: boolean | "unknown";
  ambulance: boolean | "unknown";
  pharmacy: boolean | "unknown";
  traumaCare: boolean | "unknown";
  pediatricCare: boolean | "unknown";
  mentalHealthSupport: boolean | "unknown";
  oxygen: boolean | "unknown";
  defibrillator: boolean | "unknown";
};

export type AuraMedicalCapacity = {
  bedsTotal?: number;
  bedsAvailable?: number;
  emergencyBedsAvailable?: number;
  ambulancesAvailable?: number;
  staffAvailable?: number;
  lastUpdatedAt?: string;
  isEstimated: boolean;
};

export type AuraMedicalPoint = {
  id: string;
  name: string;
  type: "hospital" | "clinic" | "field_medical_point" | "pharmacy" | "ambulance_base" | "triage_point" | "shelter_medical_point" | "temporary_care_point" | "other";
  status: AuraMedicalPointStatus;
  location: { lat: number; lng: number; label?: string; isApproximate?: boolean };
  services: AuraMedicalServices;
  capacity?: AuraMedicalCapacity;
  operator?: { name: string; type: "public" | "private" | "ngo" | "military" | "municipal" | "unknown" };
  confidence: AuraConfidence;
  publicNotes?: string;
  internalNotes?: string;
  updatedAt: string;
};

export type AuraTriageCase = {
  id: string;
  status: "new" | "waiting" | "in_triage" | "stabilized" | "transport_required" | "transferred" | "closed";
  urgency: AuraMedicalUrgency;
  category: "injury" | "respiratory" | "cardiac" | "burn" | "trauma" | "exposure" | "mental_health" | "unknown";
  location?: { lat?: number; lng?: number; label?: string; isApproximate?: boolean };
  linkedEventId?: string;
  linkedVigiaReportId?: string;
  linkedTalosAssessmentId?: string;
  assignedMedicalPointId?: string;
  transportRequired: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type AuraMedicalStockItem = {
  id: string;
  name: string;
  category: "first_aid" | "medicine" | "oxygen" | "trauma" | "burn_care" | "ppe" | "sanitation" | "equipment" | "other";
  quantity: number;
  unit: string;
  status: "available" | "low" | "critical" | "depleted" | "unknown";
  locationId?: string;
  expirationDate?: string;
  restricted: boolean;
  updatedAt: string;
};

export type AuraFeature =
  | "view_public_aura"
  | "edit_own_medical_profile"
  | "view_own_medical_profile"
  | "share_emergency_summary"
  | "view_nearby_medical_points"
  | "create_medical_report"
  | "view_professional_dashboard"
  | "view_triage_queue"
  | "manage_triage_case"
  | "view_medical_capacity"
  | "update_medical_capacity"
  | "view_medical_stock"
  | "update_medical_stock"
  | "request_medical_transport"
  | "view_sensitive_medical_data"
  | "send_to_nexus"
  | "send_to_hermes"
  | "send_to_atlas"
  | "export_medical_summary";

export type AuraRoleContext = { id?: string; role: ArgusRole };
