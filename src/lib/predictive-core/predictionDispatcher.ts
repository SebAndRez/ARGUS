import type {
  ArgusDecisionPacket,
  ArgusPredictionInput,
  ArgusPredictionResult,
} from "@/types/predictiveCore";

function notificationSeverity(severity: ArgusPredictionResult["severity"]) {
  if (severity === "P0") return "P0_CRITICAL";
  if (severity === "P1") return "P1_HIGH";
  if (severity === "P2") return "P2_MEDIUM";
  if (severity === "P3") return "P3_LOW";
  return "P4_INFO";
}

export function createDecisionPacket(
  result: ArgusPredictionResult,
  input: ArgusPredictionInput
): ArgusDecisionPacket {
  const hasCoordinates = input.latitude !== undefined && input.longitude !== undefined;

  return {
    analysis: result,
    ...(result.notificationEligible
      ? {
          notification: {
            title: result.title,
            body: result.publicMessage,
            severity: notificationSeverity(result.severity),
            actionUrl: hasCoordinates
              ? `/app?lat=${input.latitude}&lng=${input.longitude}&analysisId=${result.id}`
              : `/app?analysisId=${result.id}`,
          },
        }
      : {}),
    ...(hasCoordinates
      ? {
          mapFocus: {
            latitude: input.latitude!,
            longitude: input.longitude!,
            zoom: result.severity === "P0" || result.severity === "P1" ? 10 : 8,
          },
        }
      : {}),
    ...(result.fenixEligible && hasCoordinates
      ? {
          fenixSeed: {
            latitude: input.latitude!,
            longitude: input.longitude!,
            hazardType: input.kind,
            severity: result.severity,
            confidence: result.confidence,
          },
        }
      : {}),
    ...(result.commandCenterEligible
      ? {
          commandCenterHint: {
            priority: notificationSeverity(result.severity),
            suggestedQueue: result.primaryMode === "official" ? "official-monitoring" : "human-validation",
            requiresHumanValidation: result.primaryMode !== "official",
          },
        }
      : {}),
  };
}
