import type { DeadManSwitchStatus, SensorSafetyCheckIn, SensorSafetySettings } from "@/types/sensorSafety";

export function scheduleCheckIn(settings: SensorSafetySettings) {
  return {
    dueAt: new Date(Date.now() + settings.deadManSwitchIntervalMinutes * 60_000).toISOString(),
    status: "ACTIVE" as DeadManSwitchStatus,
  };
}

export function evaluateMissedCheckIn(checkIn: SensorSafetyCheckIn) {
  if (["USER_SAFE", "NEED_HELP", "INJURED", "TRAPPED", "CANNOT_MOVE"].includes(checkIn.status)) {
    return "CANCELED" as DeadManSwitchStatus;
  }
  return new Date(checkIn.deadlineAt).getTime() < Date.now()
    ? "MISSED_CHECK_IN"
    : "CHECK_IN_DUE";
}

export function escalateMissedCheckIn(checkIn: SensorSafetyCheckIn) {
  return {
    status: "ESCALATED" as DeadManSwitchStatus,
    allowed: checkIn.escalationAllowed,
    summary:
      "La no respuesta genera una alerta preliminar, no confirma peligro.",
  };
}
