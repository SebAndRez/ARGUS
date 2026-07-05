import type { AuraCapacityStatus, AuraMedicalPoint } from "@/modules/aura/types";

export function calculateAuraMedicalCapacityStatus(point: AuraMedicalPoint): AuraCapacityStatus {
  const available = point.capacity?.bedsAvailable ?? point.capacity?.emergencyBedsAvailable;
  if (point.status === "saturated") return "saturated";
  if (point.status === "closed") return "unknown";
  if (available === undefined) return "unknown";
  if (available <= 0) return "saturated";
  if (available <= 3) return "limited";
  return "available";
}
