import type {
  MedicalAidRequest,
  MedicalAidSeverity,
  MedicalAidType,
  MedicalPoint,
} from "@/types/medical";

const severityByType: Record<MedicalAidType, MedicalAidSeverity> = {
  need_help: "medium",
  bleeding: "high",
  breathing_difficulty: "critical",
  injury: "medium",
  trapped: "critical",
  other: "unknown",
};

export function estimateMedicalAidSeverity(
  type: MedicalAidType
): MedicalAidSeverity {
  return severityByType[type] ?? "unknown";
}

export function createDemoMedicalAidRequest(input: {
  type: MedicalAidType;
  latitude: number;
  longitude: number;
  publicNote?: string;
  nearestMedicalPoint?: MedicalPoint;
}): MedicalAidRequest {
  return {
    id: `medical-aid-${Date.now()}`,
    type: input.type,
    severity: estimateMedicalAidSeverity(input.type),
    status: "created",
    latitude: input.latitude,
    longitude: input.longitude,
    publicNote: input.publicNote,
    nearestMedicalPoint: input.nearestMedicalPoint,
    createdAt: new Date().toISOString(),
  };
}
