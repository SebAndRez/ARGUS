import type {
  QuakeSenseDetectorResult,
  QuakeSenseLocalSample,
  QuakeSenseSettings,
} from "@/types/quakesense";

const sensitivityThreshold = {
  low: 16,
  medium: 11,
  high: 7,
};

export function calculateAccelerationMagnitude(
  sample: Pick<QuakeSenseLocalSample, "accelerationX" | "accelerationY" | "accelerationZ">
) {
  return Math.sqrt(
    sample.accelerationX ** 2 +
      sample.accelerationY ** 2 +
      sample.accelerationZ ** 2
  );
}

export function smoothSamples(samples: QuakeSenseLocalSample[]) {
  if (samples.length < 3) return samples;
  return samples.map((sample, index) => {
    const neighbors = samples.slice(Math.max(0, index - 1), index + 2);
    const average =
      neighbors.reduce((sum, item) => sum + item.accelerationMagnitude, 0) /
      neighbors.length;
    return { ...sample, accelerationMagnitude: average };
  });
}

export function classifyMotionPattern(samples: QuakeSenseLocalSample[]) {
  const peak = Math.max(0, ...samples.map((sample) => sample.accelerationMagnitude));
  const activeSamples = samples.filter((sample) => sample.accelerationMagnitude > 4);
  const rotationSum = samples.reduce((sum, sample) => {
    const rate = sample.rotationRate;
    return sum + Math.abs(rate?.alpha ?? 0) + Math.abs(rate?.beta ?? 0) + Math.abs(rate?.gamma ?? 0);
  }, 0);
  const durationMs =
    samples.length > 1
      ? samples[samples.length - 1].timestamp - samples[0].timestamp
      : 0;

  return {
    peak,
    activeSamples: activeSamples.length,
    durationMs,
    isLikelyHumanMotion: durationMs < 600 || rotationSum > samples.length * 120,
    isLikelyVehicleMotion: durationMs > 9000 && activeSamples.length > samples.length * 0.65,
    repeatedOscillation: activeSamples.length >= 6,
  };
}

export function calculateShakeConfidence(
  result: ReturnType<typeof classifyMotionPattern>,
  settings: QuakeSenseSettings
) {
  let confidence = 0;
  const threshold = sensitivityThreshold[settings.sensitivity];

  if (result.peak >= threshold) confidence += 32;
  if (result.repeatedOscillation) confidence += 28;
  if (result.durationMs >= 1200 && result.durationMs <= 6000) confidence += 22;
  if (!result.isLikelyHumanMotion) confidence += 10;
  if (!result.isLikelyVehicleMotion) confidence += 8;
  if (result.peak > threshold * 2.2 && result.activeSamples <= 2) confidence -= 22;
  if (settings.requireStationaryHint && result.isLikelyVehicleMotion) confidence -= 18;

  return Math.max(0, Math.min(100, Math.round(confidence)));
}

export function detectShakeWindow(
  samples: QuakeSenseLocalSample[],
  settings: QuakeSenseSettings
): QuakeSenseDetectorResult {
  const smoothed = smoothSamples(samples).slice(-80);
  const pattern = classifyMotionPattern(smoothed);
  const confidence = calculateShakeConfidence(pattern, settings);
  const isPossibleSeismicMotion =
    confidence >= settings.minConfidenceToReport &&
    !pattern.isLikelyVehicleMotion &&
    pattern.repeatedOscillation;

  return {
    detection: isPossibleSeismicMotion
      ? {
          id: `quakesense-local-${Date.now()}`,
          detectedAt: new Date().toISOString(),
          peakAcceleration: pattern.peak,
          durationMs: pattern.durationMs,
          sampleCount: smoothed.length,
          confidence,
          deviceState: settings.requireStationaryHint ? "stationary_hint" : "unknown",
          isLikelyHumanMotion: pattern.isLikelyHumanMotion,
          isLikelyVehicleMotion: pattern.isLikelyVehicleMotion,
          isPossibleSeismicMotion,
          source: "device_motion",
          status: "POSSIBLE_SHAKE",
        }
      : null,
    peakAcceleration: pattern.peak,
    durationMs: pattern.durationMs,
    sampleCount: smoothed.length,
    confidence,
    reason: isPossibleSeismicMotion
      ? "posible sacudida detectada por heuristica experimental"
      : "sin patron multi-pico suficiente",
  };
}

export function shouldReportCitizenSignal(
  result: QuakeSenseDetectorResult,
  settings: QuakeSenseSettings
) {
  return Boolean(
    settings.enabled &&
      settings.shareOnlyOnDetection &&
      result.detection &&
      result.confidence >= settings.minConfidenceToReport
  );
}
