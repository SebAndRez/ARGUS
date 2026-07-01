import type {
  GpsContext,
  RoadSenseEventType,
  RoadSenseVehicleState,
  SensorSample,
  SensorSafetySettings,
} from "@/types/sensorSafety";

export function classifyVehicleState(
  samples: SensorSample[],
  gpsContext: GpsContext = {}
): RoadSenseVehicleState {
  const maxSpeed = Math.max(gpsContext.speedBeforeKmh ?? 0, gpsContext.speedAfterKmh ?? 0);
  if (maxSpeed >= 25) return "IN_VEHICLE";
  if (maxSpeed >= 10) return "POSSIBLY_IN_VEHICLE";
  if (gpsContext.stoppedAfterMovement) return "STATIONARY_AFTER_MOVEMENT";
  if (samples.length === 0) return "UNKNOWN";
  return "NOT_IN_VEHICLE";
}

export function detectPossibleCrash(samples: SensorSample[], gpsContext: GpsContext = {}) {
  const peak = Math.max(0, ...samples.map((sample) => sample.accelerationMagnitude));
  const speedDrop =
    typeof gpsContext.speedBeforeKmh === "number" &&
    typeof gpsContext.speedAfterKmh === "number" &&
    gpsContext.speedBeforeKmh - gpsContext.speedAfterKmh >= 25;
  const vehicleState = classifyVehicleState(samples, gpsContext);
  const detected =
    peak >= 24 &&
    (speedDrop || gpsContext.stoppedAfterMovement) &&
    ["IN_VEHICLE", "POSSIBLY_IN_VEHICLE", "STATIONARY_AFTER_MOVEMENT"].includes(vehicleState);

  return {
    detected,
    type: "POSSIBLE_CRASH" as RoadSenseEventType,
    peakAcceleration: peak,
    vehicleState,
    confidence: calculateRoadSenseConfidence(peak, speedDrop, vehicleState),
  };
}

export function detectPossibleRollover(samples: SensorSample[], gyroContext?: { rotationPeak?: number }) {
  const peak = Math.max(0, ...samples.map((sample) => sample.accelerationMagnitude));
  const rotationPeak =
    gyroContext?.rotationPeak ?? Math.max(0, ...samples.map((sample) => sample.rotationRate ?? 0));
  return {
    detected: peak >= 16 && rotationPeak >= 180,
    type: "POSSIBLE_ROLLOVER" as RoadSenseEventType,
    peakAcceleration: peak,
    rotationPeak,
    confidence: Math.min(88, Math.round(peak * 1.6 + rotationPeak / 5)),
  };
}

export function detectHardBrake(samples: SensorSample[], gpsContext: GpsContext = {}) {
  const speedDrop =
    typeof gpsContext.speedBeforeKmh === "number" &&
    typeof gpsContext.speedAfterKmh === "number"
      ? gpsContext.speedBeforeKmh - gpsContext.speedAfterKmh
      : 0;
  return {
    detected: speedDrop >= 30,
    type: "HARD_BRAKE" as RoadSenseEventType,
    speedDrop,
    confidence: Math.min(80, Math.round(speedDrop * 1.8)),
  };
}

export function detectSuddenStopAfterMovement(gpsContext: GpsContext = {}) {
  return Boolean(gpsContext.stoppedAfterMovement && (gpsContext.speedBeforeKmh ?? 0) >= 20);
}

export function calculateRoadSenseConfidence(
  peak: number,
  speedDrop: boolean,
  vehicleState: RoadSenseVehicleState
) {
  let confidence = Math.min(70, Math.round(peak * 2));
  if (speedDrop) confidence += 12;
  if (vehicleState === "IN_VEHICLE") confidence += 10;
  if (vehicleState === "POSSIBLY_IN_VEHICLE") confidence += 5;
  return Math.min(92, confidence);
}

export function shouldTriggerRoadSafetyCheck(
  result: { detected: boolean; confidence: number },
  settings: SensorSafetySettings
) {
  return (
    settings.enabled &&
    settings.enabledModules.includes("ROADSENSE") &&
    result.detected &&
    result.confidence >= 55
  );
}
