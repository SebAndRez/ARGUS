export type ConsentType =
  | "TERMS_ACCEPTED"
  | "PRIVACY_ACCEPTED"
  | "LOCATION_REPORTING"
  | "SOS_LOCATION"
  | "MEDICAL_PROFILE"
  | "EMERGENCY_CONTACT"
  | "SENSOR_SAFETY"
  | "QUAKESENSE"
  | "ROADSENSE"
  | "FALLSENSE"
  | "MISSING_PERSON_ESCALATION"
  | "COMMAND_CENTER_VISIBILITY"
  | "DATA_EXPORT"
  | "DATA_DELETION";

export interface ConsentRecord {
  id: string;
  userId: string;
  consentType: ConsentType;
  version: string;
  acceptedAt: string;
  revokedAt?: string | null;
  source: "web" | "pwa" | "mobile" | "admin";
  ipHash?: string | null;
  userAgentHash?: string | null;
}
