import type { SensorSample, SensorSafetySettings } from "@/types/sensorSafety";

export function detectHardFall(samples: SensorSample[]) {
  const peak = Math.max(0, ...samples.map((sample) => sample.accelerationMagnitude));
  const lowBeforeImpact = samples.some((sample) => sample.accelerationMagnitude <= 2.5);
  const detected = peak >= 18 && lowBeforeImpact;
  return {
    detected,
    type: "POSSIBLE_FALL" as const,
    peakAcceleration: peak,
    confidence: calculateFallConfidence({ peak, lowBeforeImpact, noMovement: false }),
  };
}

export function detectNoMovementAfterFall(samples: SensorSample[]) {
  const tail = samples.slice(-12);
  if (tail.length < 4) return false;
  const average =
    tail.reduce((sum, sample) => sum + sample.accelerationMagnitude, 0) / tail.length;
  return average < 1.8;
}

export function calculateFallConfidence(input: {
  peak: number;
  lowBeforeImpact: boolean;
  noMovement: boolean;
}) {
  let confidence = Math.min(70, Math.round(input.peak * 2.5));
  if (input.lowBeforeImpact) confidence += 10;
  if (input.noMovement) confidence += 15;
  return Math.min(92, confidence);
}

export function shouldTriggerFallSafetyCheck(
  result: { detected: boolean; confidence: number },
  settings: SensorSafetySettings
) {
  return (
    settings.enabled &&
    settings.enabledModules.includes("FALLSENSE") &&
    result.detected &&
    result.confidence >= 55
  );
}
