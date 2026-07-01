import {
  demoMobileQuakeEvent,
  demoMobileSafetySettings,
  demoSafetyChecks,
} from "@/data/mobileSafetyDemo";
import type {
  MobileQuakeDetectionEvent,
  MobileSafetySettings,
  SafetyCheck,
  SafetyCheckResponse,
} from "@/types/mobileSafety";

type MobileSafetyStore = {
  settings: MobileSafetySettings;
  quakeEvents: MobileQuakeDetectionEvent[];
  safetyChecks: SafetyCheck[];
};

const globalStore = globalThis as typeof globalThis & {
  __argusMobileSafetyStore?: MobileSafetyStore;
};

function getStore(): MobileSafetyStore {
  if (!globalStore.__argusMobileSafetyStore) {
    globalStore.__argusMobileSafetyStore = {
      settings: demoMobileSafetySettings,
      quakeEvents: [demoMobileQuakeEvent],
      safetyChecks: [...demoSafetyChecks],
    };
  }

  return globalStore.__argusMobileSafetyStore;
}

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}`;
}

export function getMobileSafetySettings() {
  return getStore().settings;
}

export function updateMobileSafetySettings(
  patch: Partial<MobileSafetySettings>
) {
  const store = getStore();
  store.settings = {
    ...store.settings,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  return store.settings;
}

export function getMobileQuakeEvents() {
  return getStore().quakeEvents;
}

export function createMobileQuakeEvent(
  input: Partial<MobileQuakeDetectionEvent>
) {
  const now = new Date().toISOString();
  const event: MobileQuakeDetectionEvent = {
    ...demoMobileQuakeEvent,
    ...input,
    id: input.id ?? createId("mobile-quake"),
    detectedAt: input.detectedAt ?? now,
    source: "mobile_safety_agent",
    isDemo: input.isDemo ?? true,
  };
  getStore().quakeEvents.unshift(event);
  return event;
}

export function getSafetyChecks() {
  return getStore().safetyChecks;
}

export function createSafetyCheck(input: Partial<SafetyCheck>) {
  const settings = getMobileSafetySettings();
  const now = new Date().toISOString();
  const check: SafetyCheck = {
    id: input.id ?? createId("safety-check"),
    userId: input.userId ?? settings.userId,
    triggerEventId: input.triggerEventId ?? "manual-demo",
    status: input.status ?? "NOTIFIED",
    createdAt: input.createdAt ?? now,
    notificationSentAt: input.notificationSentAt ?? now,
    timeoutSeconds: input.timeoutSeconds ?? settings.checkInTimeoutSeconds,
    lastApproxLat: input.lastApproxLat,
    lastApproxLng: input.lastApproxLng,
    lastAccuracyBand: input.lastAccuracyBand ?? "district",
    batteryLevel: input.batteryLevel,
    networkStatus: input.networkStatus ?? "online",
    emergencyContactsNotified: input.emergencyContactsNotified ?? false,
    commandCenterVisible: input.commandCenterVisible ?? true,
    missingPersonCandidate: input.missingPersonCandidate ?? false,
    notes: input.notes,
    isDemo: input.isDemo ?? true,
  };
  getStore().safetyChecks.unshift(check);
  return check;
}

export function respondToSafetyCheck(
  id: string,
  response: SafetyCheckResponse
) {
  const store = getStore();
  const check = store.safetyChecks.find((item) => item.id === id);
  if (!check) return null;

  check.response = response;
  check.respondedAt = new Date().toISOString();
  check.status =
    response === "I_AM_SAFE" || response === "FALSE_ALARM"
      ? "USER_SAFE"
      : response === "NEED_HELP"
        ? "USER_NEEDS_HELP"
        : response === "INJURED"
          ? "USER_INJURED"
          : "USER_TRAPPED";
  check.commandCenterVisible = check.status !== "USER_SAFE";
  return check;
}

export function escalateSafetyCheck(id: string, reason?: string) {
  const store = getStore();
  const check = store.safetyChecks.find((item) => item.id === id);
  if (!check) return null;

  check.status = "ESCALATED";
  check.escalationAt = new Date().toISOString();
  check.emergencyContactsNotified = true;
  check.commandCenterVisible = true;
  check.missingPersonCandidate = true;
  check.notes = reason ?? "Sin respuesta dentro del periodo de check-in demo.";
  return check;
}
