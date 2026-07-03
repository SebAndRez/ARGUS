import { classifyPredictionInput } from "@/lib/predictive-core/inputClassifier";
import { getPredictionContext } from "@/lib/predictive-core/contextRetriever";
import { calculatePrediction } from "@/lib/predictive-core/predictiveCalculator";
import { createDecisionPacket } from "@/lib/predictive-core/predictionDispatcher";
import {
  normalizeEventToPredictionInput,
  normalizeExternalEventToPredictionInput,
  normalizeReportToPredictionInput,
  normalizeSosToPredictionInput,
  normalizeUnknownToPredictionInput,
} from "@/lib/predictive-core/inputNormalizer";
import type { ArgusDecisionPacket, ArgusPredictionInput } from "@/types/predictiveCore";

export async function runArgusPredictiveCore(
  input: ArgusPredictionInput
): Promise<ArgusDecisionPacket> {
  const classification = classifyPredictionInput(input);
  const context = await getPredictionContext(input, classification);
  const analysis = calculatePrediction(input, classification, context);
  return createDecisionPacket(analysis, input);
}

export function analyzeEvent(event: unknown) {
  return runArgusPredictiveCore(normalizeEventToPredictionInput(event));
}

export function analyzeReport(report: unknown) {
  return runArgusPredictiveCore(normalizeReportToPredictionInput(report));
}

export function analyzeSos(sos: unknown) {
  return runArgusPredictiveCore(normalizeSosToPredictionInput(sos));
}

export function analyzeExternalEvent(event: unknown) {
  return runArgusPredictiveCore(normalizeExternalEventToPredictionInput(event));
}

export function analyzeUnknown(input: unknown) {
  return runArgusPredictiveCore(normalizeUnknownToPredictionInput(input));
}
