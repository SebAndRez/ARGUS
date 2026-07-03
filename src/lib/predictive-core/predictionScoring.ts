import type {
  ArgusPredictionClassification,
  ArgusPredictionContext,
  ArgusPredictionInput,
  ArgusPredictionResult,
} from "@/types/predictiveCore";

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function contextCount(context: ArgusPredictionContext) {
  return (
    context.nearbyEvents.length +
    context.nearbyReports.length +
    context.relatedOfficialEvents.length +
    context.relatedOpenDataEvents.length +
    context.relatedCameras.length +
    context.knowledgeFacts.length
  );
}

export function calculateProbabilityScore(
  input: ArgusPredictionInput,
  classification: ArgusPredictionClassification,
  context: ArgusPredictionContext
) {
  let score = classification.isOfficialPrimaryEvidence ? 68 : classification.confidenceSeed;
  score += Math.min(18, context.relatedOfficialEvents.length * 8);
  score += Math.min(12, context.relatedOpenDataEvents.length * 5);
  score += Math.min(10, context.nearbyReports.length * 4);
  score += Math.min(8, context.nearbyEvents.length * 4);
  score += Math.min(6, context.knowledgeFacts.length * 2);
  if (input.latitude === undefined || input.longitude === undefined) score -= 12;
  if (input.sourceAuthority === "citizen" && context.relatedOfficialEvents.length === 0) score -= 8;
  return clamp(score, 5, 92);
}

export function calculateConfidenceScore(
  input: ArgusPredictionInput,
  classification: ArgusPredictionClassification,
  context: ArgusPredictionContext
) {
  let score = classification.confidenceSeed;
  if (classification.isOfficialPrimaryEvidence) score += 10;
  score += Math.min(15, context.relatedOfficialEvents.length * 7);
  score += Math.min(10, context.relatedOpenDataEvents.length * 4);
  score += Math.min(8, context.nearbyReports.length * 3);
  score += Math.min(6, context.relatedCameras.length * 3);
  if (context.sourceHealthContext.some((item) => JSON.stringify(item).toLowerCase().includes("error"))) score -= 10;
  if (input.latitude === undefined || input.longitude === undefined) score -= 15;
  if (input.sourceAuthority === "citizen" && contextCount(context) <= 1) score = Math.min(score, 55);
  return clamp(score, 10, 88);
}

export function calculateUncertainty(confidence: number): ArgusPredictionResult["uncertainty"] {
  if (confidence >= 72) return "baja";
  if (confidence >= 48) return "media";
  return "alta";
}

export function calculateSeverity(
  classification: ArgusPredictionClassification,
  probabilityScore: number
): ArgusPredictionResult["severity"] {
  if (classification.kind === "sos" && ["P3", "P4"].includes(classification.baseSeverity)) return "P1";
  if (probabilityScore >= 82 && classification.baseSeverity === "P2") return "P1";
  return classification.baseSeverity;
}

export function probabilityLabel(score: number): ArgusPredictionResult["probabilityLabel"] {
  if (score >= 82) return "muy alta";
  if (score >= 66) return "alta";
  if (score >= 45) return "media";
  if (score >= 25) return "baja";
  return "muy baja";
}

export function shouldNotifyNearbyUser(result: Pick<ArgusPredictionResult, "severity" | "confidence">) {
  return ["P0", "P1", "P2"].includes(result.severity) && result.confidence >= 42;
}

export function shouldSendToFenix(
  input: ArgusPredictionInput,
  result: Pick<ArgusPredictionResult, "severity" | "confidence">
) {
  return (
    input.latitude !== undefined &&
    input.longitude !== undefined &&
    ["earthquake", "tsunami", "fire", "flood", "volcano", "weather", "sos"].includes(input.kind) &&
    ["P0", "P1", "P2"].includes(result.severity) &&
    result.confidence >= 45
  );
}

export function shouldSendToCommandCenter(result: Pick<ArgusPredictionResult, "severity" | "status">) {
  return ["P0", "P1", "P2"].includes(result.severity) || result.status === "probable";
}
