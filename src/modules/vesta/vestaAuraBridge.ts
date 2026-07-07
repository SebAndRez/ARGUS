import type { AuraMedicalProfile } from "@/modules/aura/types";
import type { VestaEmergencyContact } from "@/modules/vesta/types";

/**
 * Reutiliza el perfil médico opcional de AURA (grupo sanguíneo, alergias,
 * medicamentos, contacto de emergencia) para prellenar el plan familiar de
 * VESTA, sin duplicar el almacenamiento: AURA sigue siendo la fuente de
 * verdad de esos datos médicos.
 */
export function suggestVestaMedicalNotesFromAura(profile: Pick<AuraMedicalProfile, "bloodType" | "allergies" | "chronicConditions" | "medications">) {
  const parts: string[] = [];
  if (profile.bloodType && profile.bloodType !== "unknown" && profile.bloodType !== "prefer_not_to_say") {
    parts.push(`Grupo sanguíneo: ${profile.bloodType}`);
  }
  if (profile.allergies?.length) parts.push(`Alergias: ${profile.allergies.join(", ")}`);
  if (profile.chronicConditions?.length) parts.push(`Condiciones crónicas: ${profile.chronicConditions.join(", ")}`);
  if (profile.medications?.length) parts.push(`Medicamentos: ${profile.medications.join(", ")}`);
  return parts.join(" · ") || null;
}

export function suggestVestaEmergencyContactFromAura(
  contact: AuraMedicalProfile["emergencyContact"]
): VestaEmergencyContact | null {
  if (!contact) return null;
  return {
    id: `from-aura-${contact.id}`,
    name: contact.name,
    relationship: contact.relationship ?? null,
    phone: contact.phone ?? null,
    email: contact.email ?? null,
    priority: contact.priority,
  };
}
