export type ProfileVisibility =
  | "PUBLIC"
  | "PRIVATE"
  | "AUTHORIZED_UNITS_ONLY"
  | "EMERGENCY_ONLY"
  | "ADMIN_ONLY"
  | "HIDDEN";

export type CommunityRole =
  | "ciudadano"
  | "voluntario"
  | "brigadista"
  | "operador"
  | "analista"
  | "institucion"
  | "unidad_medica"
  | "otro";

export type BloodType =
  | "A+"
  | "A-"
  | "B+"
  | "B-"
  | "AB+"
  | "AB-"
  | "O+"
  | "O-"
  | "no_se"
  | "prefiero_no_decir";

export type LocationSharingPreference =
  | "never"
  | "sos_only"
  | "sos_and_safety_check"
  | "reports";

export type LocationPrecision = "exact_emergency" | "approximate" | "manual";

export interface PublicProfileDraft {
  publicAlias: string;
  displayName: string;
  avatarUrl: string;
  approximateCity: string;
  communityRole: CommunityRole;
  preferredLanguage: string;
  usualArea: string;
  displayNameVisibility: ProfileVisibility;
}

export interface PrivateContactDraft {
  email: string;
  phonePrimary: string;
  phoneSecondary: string;
  preferredContactMethod: "app" | "email" | "phone" | "future_whatsapp";
  preferredHours: string;
  shareWithAuthorizedUnits: boolean;
  shareDuringEmergency: boolean;
  consentToStore: boolean;
}

export interface EmergencyContactDraft {
  name: string;
  relationship: string;
  phone: string;
  email: string;
  notes: string;
  consentConfirmed: boolean;
  visibility: ProfileVisibility;
  priority: "primary" | "secondary";
}

export interface MedicalEmergencyDraft {
  bloodType: BloodType;
  allergies: string;
  medications: string;
  relevantConditions: string;
  mobilityNeeds: string;
  criticalDevice: "yes" | "no" | "prefer_not";
  specialNeeds: string;
  emergencyMedicalNote: string;
  shareDuringEmergency: boolean;
  shareWithAuthorizedUnits: boolean;
  consentToStore: boolean;
}

export interface PrivacySettingsDraft {
  shareLocation: LocationSharingPreference;
  locationPrecision: LocationPrecision;
  allowAuthorizedUnitContact: boolean;
  allowEmergencyContactAccess: boolean;
  allowMedicalProfileAccess: boolean;
  allowSafetyChecks: boolean;
  allowNearbyAlerts: boolean;
  allowExternalSourceAlerts: boolean;
  allowQuakeSenseExperimental: boolean;
  understandsEmergencyLimits: boolean;
}

export interface ArgusProfileDraft {
  publicProfile: PublicProfileDraft;
  privateContact: PrivateContactDraft;
  emergencyContact: EmergencyContactDraft;
  medical: MedicalEmergencyDraft;
  privacy: PrivacySettingsDraft;
}
