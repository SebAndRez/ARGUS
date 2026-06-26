import type { MedicalProfile, PublicMedicalProfile } from "@/types/medical";

export function getEmergencyVisibleMedicalProfile(
  profile: MedicalProfile
): PublicMedicalProfile {
  const consent = profile.visibilityConsent;

  return {
    bloodType: consent.showBloodType ? profile.bloodType : undefined,
    allergies: consent.showAllergies ? profile.allergies : undefined,
    criticalMedications: consent.showCriticalMedications
      ? profile.criticalMedications
      : undefined,
    relevantConditions: consent.showRelevantConditions
      ? profile.relevantConditions
      : undefined,
    emergencyContact: consent.showEmergencyContact
      ? profile.emergencyContact
      : undefined,
  };
}

export function hasEmergencyVisibleData(profile: MedicalProfile) {
  const publicProfile = getEmergencyVisibleMedicalProfile(profile);
  return Object.values(publicProfile).some(Boolean);
}
