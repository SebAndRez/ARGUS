import type {
  ArgusNotificationSeverity,
  ArgusNotificationType,
  NotificationCategory,
  VerificationStatus,
} from "@/types/notificationCenter";

/**
 * Prompt 11 §14: text label for the category badge — always rendered as
 * visible text, never color-only, and never sharing a label with a
 * different category (so a prediction can never read as an official alert).
 */
export const notificationCategoryLabels: Record<NotificationCategory, string> = {
  official_alert: "Alerta oficial",
  confirmed_incident: "Confirmado",
  candidate_signal: "Candidato",
  citizen_report: "Reporte ciudadano",
  argus_analysis: "Analisis ARGUS",
  prediction: "Prediccion ARGUS",
  recommendation: "Recomendacion ARGUS",
  source_health: "Sistema",
  preparedness_reminder: "Recordatorio",
  system_notice: "Sistema",
  demo: "Demo",
};

/**
 * Secondary, smaller verification indicator (Prompt 11 §15: "borde/icono
 * secundario = verificación"). Absent for categories where verification
 * doesn't apply — `NotificationItem` skips rendering it in that case rather
 * than showing a placeholder value.
 */
export const verificationStatusLabels: Record<VerificationStatus, string> = {
  unverified: "No verificado",
  candidate: "En validacion",
  corroborated: "Corroborado",
  official: "Fuente oficial",
  model_generated: "Generado por modelo",
  rejected: "Descartado",
};

export function getNotificationCategoryClasses(category: NotificationCategory) {
  if (category === "official_alert") return "border-red-300/40 text-red-100";
  if (category === "confirmed_incident") return "border-orange-300/35 text-orange-100";
  if (category === "candidate_signal") return "border-amber-300/35 text-amber-100";
  if (category === "citizen_report") return "border-sky-300/30 text-sky-100";
  if (category === "prediction" || category === "argus_analysis" || category === "recommendation") {
    return "border-purple-300/30 text-purple-100";
  }
  if (category === "demo") return "border-fuchsia-300/35 text-fuchsia-100";
  return "border-slate-400/25 text-slate-300";
}

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
  REMINDER: "Recordatorio",
  SHELTER: "Refugio",
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
    REMINDER: "VST",
    SHELTER: "SHL",
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
