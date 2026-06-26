export type BloodType =
  | "A+"
  | "A-"
  | "B+"
  | "B-"
  | "AB+"
  | "AB-"
  | "O+"
  | "O-"
  | "unknown";

export type AuraModuleTier = "basic" | "pro_placeholder";

export type MedicalAidStatus =
  | "created"
  | "acknowledged"
  | "help_en_route"
  | "resolved"
  | "cancelled";

export type MedicalAidSeverity =
  | "low"
  | "medium"
  | "high"
  | "critical"
  | "unknown";

export type MedicalAidType =
  | "need_help"
  | "bleeding"
  | "breathing_difficulty"
  | "injury"
  | "trapped"
  | "other";

export type MedicalPointType =
  | "hospital"
  | "clinic"
  | "sapu_sar"
  | "temporary_medical_point"
  | "shelter_medical";

export type MedicalCapability =
  | "emergency"
  | "basic_first_aid"
  | "pharmacy"
  | "pediatric"
  | "trauma"
  | "mental_health"
  | "oxygen"
  | "shelter_support";

export type EmergencyContact = {
  name?: string;
  relationship?: string;
  phone?: string;
};

export type MedicalVisibilityConsent = {
  showBloodType: boolean;
  showAllergies: boolean;
  showCriticalMedications: boolean;
  showRelevantConditions: boolean;
  showEmergencyContact: boolean;
};

export type MedicalProfile = {
  bloodType?: BloodType;
  allergies?: string;
  criticalMedications?: string;
  relevantConditions?: string;
  emergencyContact?: EmergencyContact;
  visibilityConsent: MedicalVisibilityConsent;
  updatedAt?: string;
};

export type PublicMedicalProfile = {
  bloodType?: BloodType;
  allergies?: string;
  criticalMedications?: string;
  relevantConditions?: string;
  emergencyContact?: EmergencyContact;
};

export type MedicalPoint = {
  id: string;
  name: string;
  type: MedicalPointType;
  latitude: number;
  longitude: number;
  address?: string;
  capabilities: MedicalCapability[];
  status: "operational" | "limited" | "unknown";
  scheduleLabel?: string;
  source: "demo" | "official_future";
  lastUpdatedAt: string;
  distanceKm?: number;
};

export type MedicalAidRequest = {
  id: string;
  type: MedicalAidType;
  severity: MedicalAidSeverity;
  status: MedicalAidStatus;
  latitude: number;
  longitude: number;
  publicNote?: string;
  createdAt: string;
  nearestMedicalPoint?: MedicalPoint;
};
