import type {
  ArgusNotificationSeverity,
  ArgusNotificationType,
} from "@/types/notificationCenter";

export const severityLabels: Record<ArgusNotificationSeverity, string> = {
  P0_CRITICAL: "Critica",
  P1_HIGH: "Alta",
  P2_MEDIUM: "Media",
  P3_LOW: "Baja",
  P4_INFO: "Informativa",
};

export const severityOrder: Record<ArgusNotificationSeverity, number> = {
  P0_CRITICAL: 0,
  P1_HIGH: 1,
  P2_MEDIUM: 2,
  P3_LOW: 3,
  P4_INFO: 4,
};

export const notificationTypeLabels: Record<ArgusNotificationType, string> = {
  EARTHQUAKE: "Sismo",
  TSUNAMI: "Tsunami",
  FIRE: "Incendio",
  WEATHER: "Clima",
  FLOOD: "Inundacion",
  VOLCANO: "Volcan",
  CONFLICT: "Conflicto",
  ROUTE: "Ruta",
  MEDICAL: "Medico",
  SOS: "SOS",
  REPORT: "Reporte",
  MISSING_PERSON: "Persona",
  SENSOR: "Sensor",
  FENIX: "Fenix",
  SOURCE_UPDATE: "Fuente",
  SYSTEM: "Sistema",
};

export function getNotificationIcon(type: ArgusNotificationType) {
  const icons: Record<ArgusNotificationType, string> = {
    EARTHQUAKE: "EQ",
    TSUNAMI: "TS",
    FIRE: "FR",
    WEATHER: "WX",
    FLOOD: "FL",
    VOLCANO: "VO",
    CONFLICT: "CF",
    ROUTE: "RT",
    MEDICAL: "MD",
    SOS: "SOS",
    REPORT: "RP",
    MISSING_PERSON: "MP",
    SENSOR: "SN",
    FENIX: "FX",
    SOURCE_UPDATE: "SRC",
    SYSTEM: "ARG",
  };
  return icons[type];
}

export function getNotificationColorToken(severity: ArgusNotificationSeverity) {
  const colors: Record<ArgusNotificationSeverity, string> = {
    P0_CRITICAL: "critical",
    P1_HIGH: "high",
    P2_MEDIUM: "medium",
    P3_LOW: "low",
    P4_INFO: "info",
  };
  return colors[severity];
}

export function getNotificationSeverityClasses(severity: ArgusNotificationSeverity) {
  const classes: Record<ArgusNotificationSeverity, string> = {
    P0_CRITICAL:
      "border-red-400/45 bg-red-950/35 text-red-100 shadow-red-950/20",
    P1_HIGH:
      "border-orange-300/35 bg-orange-950/30 text-orange-100 shadow-orange-950/15",
    P2_MEDIUM:
      "border-amber-300/35 bg-amber-950/25 text-amber-100 shadow-amber-950/10",
    P3_LOW:
      "border-emerald-300/30 bg-emerald-950/20 text-emerald-100 shadow-emerald-950/10",
    P4_INFO:
      "border-sky-300/25 bg-slate-900/70 text-sky-100 shadow-slate-950/10",
  };
  return classes[severity];
}
