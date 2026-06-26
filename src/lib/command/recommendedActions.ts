import type { IncidentCommandView } from "@/types/incident";

export function buildRecommendedActions(incident: Pick<IncidentCommandView, "status" | "priority" | "type">) {
  const actions = [
    "Verificar fuente oficial.",
    "Revisar reportes ciudadanos cercanos.",
    "Mantener monitoreo operacional.",
  ];

  if (incident.priority === "P0_CRITICAL" || incident.priority === "P1_HIGH") {
    actions.push("Elevar a operador si sube prioridad o aparece confirmacion oficial.");
    actions.push("Revisar camaras disponibles si existen.");
  }

  if (incident.type === "fire" || incident.type === "weather") {
    actions.push("Revisar condiciones meteorologicas y viento.");
  }

  if (incident.status === "OFFICIAL_CONFIRMED") {
    actions.push("Seguir instrucciones de la autoridad competente.");
  } else {
    actions.push("Comunicar solo como informacion preliminar si corresponde.");
  }

  return actions;
}

export const argusIncidentLimitations = [
  "ARGUS estima, no confirma por si solo.",
  "La confianza es operacional, no probabilidad cientifica exacta.",
  "Reportes ciudadanos requieren verificacion.",
  "Contexto historico no confirma eventos actuales.",
  "Camaras no son analizadas automaticamente.",
  "Informacion oficial tiene prioridad.",
];
