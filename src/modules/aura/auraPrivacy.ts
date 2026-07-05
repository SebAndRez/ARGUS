import type { ArgusRole } from "@/types/rbac";
import type { AuraMedicalProfile, AuraMedicalVisibility } from "@/modules/aura/types";

export function getAuraMedicalDataVisibility(userRole: ArgusRole, profileVisibility: AuraMedicalVisibility) {
  if (userRole === "ADMIN" || userRole === "SUPER_ADMIN" || userRole === "MEDICAL_OPERATOR") return "necessary_sensitive";
  if (profileVisibility === "institutional_aggregated" && ["ANALYST", "LOGISTICS", "INSTITUTIONAL_ADMIN"].includes(userRole)) return "aggregated_only";
  if (profileVisibility === "private") return "private";
  if (["OPERATOR", "INSTITUTIONAL_ADMIN"].includes(userRole)) return "emergency_summary";
  return "own_profile_only";
}

export function sanitizeAuraMedicalProfileForRole(profile: AuraMedicalProfile, userRole: ArgusRole): Partial<AuraMedicalProfile> {
  const visibility = getAuraMedicalDataVisibility(userRole, profile.visibility);
  if (visibility === "necessary_sensitive") return profile;
  if (visibility === "emergency_summary") {
    return {
      userId: profile.userId,
      bloodType: profile.bloodType,
      allergies: profile.allergies?.length ? ["Declaradas; ver con personal sanitario autorizado"] : [],
      emergencyNotes: profile.emergencyNotes,
      emergencyContact: profile.emergencyContact,
      visibility: profile.visibility,
      isComplete: profile.isComplete,
      updatedAt: profile.updatedAt,
    };
  }
  if (visibility === "aggregated_only") {
    return { userId: "aggregated", visibility: "institutional_aggregated", isComplete: profile.isComplete, updatedAt: profile.updatedAt };
  }
  return { userId: profile.userId, visibility: profile.visibility, isComplete: profile.isComplete, updatedAt: profile.updatedAt };
}
