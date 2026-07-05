import type { CustosHumanitarianStatus } from "@/modules/custos/types";

export function deriveCustosHumanitarianStatus(input: { safeCheckIn?: boolean; shelterCheckIn?: boolean; medicalTransfer?: boolean; missingReport?: boolean; needsHelp?: boolean }): CustosHumanitarianStatus {
  if (input.needsHelp) return "needs_help";
  if (input.medicalTransfer) return "medical_attention";
  if (input.shelterCheckIn) return "in_shelter";
  if (input.safeCheckIn) return "reported_safe";
  if (input.missingReport) return "missing_reported";
  return "unknown";
}
