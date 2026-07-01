import type {
  SensorSafetyCheckIn,
  SensorSafetyDetection,
  SensorSafetyResponse,
  SensorSafetySettings,
} from "@/types/sensorSafety";

export function calculateCheckInDeadline(timeoutSeconds: number) {
  return new Date(Date.now() + timeoutSeconds * 1000).toISOString();
}

export function createSafetyCheckFromDetection(
  detection: SensorSafetyDetection,
  settings: SensorSafetySettings
): SensorSafetyCheckIn {
  return {
    id: `sensor-check-${Date.now().toString(36)}`,
    detectionId: detection.id,
    status: "BLOCKING_MODAL_SHOWN",
    createdAt: new Date().toISOString(),
    deadlineAt: calculateCheckInDeadline(settings.checkInTimeoutSeconds),
    approximateLat: settings.allowApproxLocationOnEmergency
      ? detection.approximateLat
      : undefined,
    approximateLng: settings.allowApproxLocationOnEmergency
      ? detection.approximateLng
      : undefined,
    accuracyBand: settings.allowApproxLocationOnEmergency
      ? detection.accuracyBand
      : "none",
    escalationAllowed: settings.allowCommandCenterEscalation,
    auraAllowed: settings.allowAuraMedicalAid,
    missingPersonCandidateAllowed: settings.allowMissingPersonCandidate,
    isDemo: detection.isDemo,
  };
}

export function processSafetyCheckResponse(
  checkIn: SensorSafetyCheckIn,
  response: SensorSafetyResponse
): SensorSafetyCheckIn {
  const status =
    response === "I_AM_SAFE" || response === "WITH_OTHERS"
      ? "USER_SAFE"
      : response === "FALSE_ALARM"
        ? "FALSE_ALARM"
        : response === "NO_RESPONSE"
          ? "NO_RESPONSE"
          : response;
  return { ...checkIn, response, status };
}

export function evaluateNoResponse(checkIn: SensorSafetyCheckIn) {
  return new Date(checkIn.deadlineAt).getTime() <= Date.now();
}

export function buildEscalationPayload(checkIn: SensorSafetyCheckIn) {
  return {
    escalated: checkIn.escalationAllowed,
    status: checkIn.escalationAllowed ? "ESCALATED" : "NO_RESPONSE",
    auraEvidence: checkIn.auraAllowed,
    missingPersonCandidate: checkIn.missingPersonCandidateAllowed,
    summary:
      "Usuario no responde. Posible situacion de riesgo; pendiente de verificacion.",
  };
}
