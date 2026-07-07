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
  | "sapu"
  | "shelter_medical"
  | "temporary_medical_point";

export type MedicalPointAvailability =
  | "available"
  | "limited"
  | "unknown"
  | "closed";

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

/**
 * Fuente unica de puntos medicos consumida por AURA (SOS Medico rapido y
 * dashboard completo) y por el mapa operacional. Se deriva de
 * `AuraMedicalPoint` (`@/modules/aura/types`) via `@/data/auraMedicalPoints`
 * — no existe un segundo dataset medico paralelo.
 */
export type MedicalPoint = {
  id: string;
  name: string;
  type: MedicalPointType;
  lat: number;
  lng: number;
  capabilities: string[];
  distanceKm?: number;
  availabilityStatus: MedicalPointAvailability;
  isDemo: boolean;
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
