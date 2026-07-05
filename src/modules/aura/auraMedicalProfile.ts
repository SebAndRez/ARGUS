import type { AuraMedicalProfile } from "@/modules/aura/types";

export function getAuraProfileCompleteness(profile: AuraMedicalProfile) {
  const fields = [profile.bloodType, profile.allergies?.length, profile.emergencyContact, profile.emergencyNotes];
  return Math.round((fields.filter(Boolean).length / fields.length) * 100);
}

export function validateAuraMedicalProfile(profile: AuraMedicalProfile) {
  const warnings: string[] = [];
  if (!profile.consentUpdatedAt) warnings.push("Falta fecha de consentimiento para datos medicos opcionales.");
  if (!profile.emergencyContact) warnings.push("No hay contacto de emergencia declarado.");
  return { valid: Boolean(profile.userId && profile.visibility), warnings };
}

export function prepareAuraEmergencySummary(profile: AuraMedicalProfile) {
  return {
    userId: profile.userId,
    bloodType: profile.bloodType ?? "unknown",
    hasAllergiesDeclared: Boolean(profile.allergies?.length),
    hasEmergencyContact: Boolean(profile.emergencyContact),
    note: "Datos medicos opcionales disponibles para emergencia. Verifique con personal sanitario autorizado.",
  };
}
