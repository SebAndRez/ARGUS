import {
  demoSensorSafetyDetections,
  demoSensorSafetySettings,
} from "@/data/sensorSafetyDemo";
import {
  buildEscalationPayload,
  createSafetyCheckFromDetection,
  processSafetyCheckResponse,
} from "@/lib/sensor-safety/safetyCheckEngine";
import type {
  SensorSafetyCheckIn,
  SensorSafetyDetection,
  SensorSafetyDetectionType,
  SensorSafetySettings,
  SensorSafetyResponse,
} from "@/types/sensorSafety";

type SensorSafetyStore = {
  settings: SensorSafetySettings;
  detections: SensorSafetyDetection[];
  checkIns: SensorSafetyCheckIn[];
};

const globalStore = globalThis as typeof globalThis & {
  __argusSensorSafetyStore?: SensorSafetyStore;
};

function getStore(): SensorSafetyStore {
  if (!globalStore.__argusSensorSafetyStore) {
    globalStore.__argusSensorSafetyStore = {
      settings: demoSensorSafetySettings,
      detections: [...demoSensorSafetyDetections],
      checkIns: [],
    };
  }
  return globalStore.__argusSensorSafetyStore;
}

export function getSensorSafetySettings() {
  return getStore().settings;
}

export function updateSensorSafetySettings(patch: Partial<SensorSafetySettings>) {
  const store = getStore();
  store.settings = {
    ...store.settings,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  return store.settings;
}

export function getSensorSafetyDetections() {
  return getStore().detections;
}

export function getSensorSafetyCheckIns() {
  return getStore().checkIns;
}

export function createSensorSafetyDetection(
  input: Partial<SensorSafetyDetection>
) {
  const settings = getSensorSafetySettings();
  const type = input.type ?? "DEMO";
  const detectionModule = input.module ?? moduleFromType(type);
  const detection: SensorSafetyDetection = {
    id: input.id ?? `sensor-detection-${Date.now().toString(36)}`,
    userId: input.userId,
    deviceSessionIdHash: input.deviceSessionIdHash ?? "demo-device-session",
    module: detectionModule,
    type,
    status: input.status ?? "CHECK_IN_REQUIRED",
    detectedAt: input.detectedAt ?? new Date().toISOString(),
    confidence: input.confidence ?? 65,
    severity: input.severity ?? "medium",
    appState: input.appState ?? "OPEN",
    platform: input.platform ?? "WEB_PWA",
    approximateLat: input.approximateLat,
    approximateLng: input.approximateLng,
    accuracyBand: input.accuracyBand ?? "district",
    blackBoxEvent: input.blackBoxEvent,
    isDemo: input.isDemo ?? true,
    argusSummary: input.argusSummary ?? buildDemoSummary(type),
    recommendedAction:
      input.recommendedAction ??
      "Solicitar Safety Check y verificar antes de escalar.",
  };
  const checkIn = createSafetyCheckFromDetection(detection, settings);
  detection.checkInId = checkIn.id;
  getStore().detections.unshift(detection);
  getStore().checkIns.unshift(checkIn);
  return { detection, checkIn };
}

export function respondToSensorSafetyCheck(
  id: string,
  response: SensorSafetyResponse
) {
  const store = getStore();
  const index = store.checkIns.findIndex((checkIn) => checkIn.id === id);
  if (index < 0) return null;
  const updated = processSafetyCheckResponse(store.checkIns[index], response);
  store.checkIns[index] = updated;
  return updated;
}

export function escalateSensorSafetyCheck(id: string) {
  const store = getStore();
  const index = store.checkIns.findIndex((checkIn) => checkIn.id === id);
  if (index < 0) return null;
  const payload = buildEscalationPayload(store.checkIns[index]);
  store.checkIns[index] = {
    ...store.checkIns[index],
    status: payload.escalated ? "ESCALATED" : "NO_RESPONSE",
  };
  return { checkIn: store.checkIns[index], payload };
}

export function createDemoSensorSafetyScenario(scenario: string) {
  const typeByScenario: Record<string, SensorSafetyDetectionType> = {
    road_crash: "VEHICLE_CRASH",
    rollover: "VEHICLE_ROLLOVER",
    hard_fall: "HARD_FALL",
    route_stop: "ROUTE_STOP_ANOMALY",
    dead_man_no_response: "NO_RESPONSE",
    quake_shake: "EARTHQUAKE_SHAKE",
  };
  return createSensorSafetyDetection({
    type: typeByScenario[scenario] ?? "DEMO",
    approximateLat: -33.4489,
    approximateLng: -70.6693,
    accuracyBand: "district",
    isDemo: true,
  });
}

function moduleFromType(type: SensorSafetyDetectionType) {
  if (type === "EARTHQUAKE_SHAKE") return "QUAKESENSE" as const;
  if (["VEHICLE_CRASH", "VEHICLE_ROLLOVER", "HARD_BRAKE"].includes(type)) {
    return "ROADSENSE" as const;
  }
  if (type === "HARD_FALL") return "FALLSENSE" as const;
  if (["ROUTE_STOP_ANOMALY", "ROUTE_DEVIATION"].includes(type)) {
    return "ROUTE_GUARDIAN" as const;
  }
  if (type === "NO_RESPONSE") return "DEAD_MAN_SWITCH" as const;
  return "SAFETY_CHECK" as const;
}

function buildDemoSummary(type: SensorSafetyDetectionType) {
  if (type === "VEHICLE_CRASH") {
    return "Deteccion preliminar de posible accidente vehicular. Pendiente de confirmacion.";
  }
  if (type === "VEHICLE_ROLLOVER") {
    return "Deteccion preliminar de posible volcamiento. Pendiente de confirmacion.";
  }
  if (type === "HARD_FALL") {
    return "Deteccion preliminar de posible caida fuerte. No confirma lesion.";
  }
  if (type === "NO_RESPONSE") {
    return "Usuario no responde. Posible situacion de riesgo, pendiente de verificacion.";
  }
  return "Deteccion preliminar experimental de ARGUS Sensor Safety Suite.";
}
