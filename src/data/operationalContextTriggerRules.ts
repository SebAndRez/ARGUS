import { severityAtLeast } from "@/data/moduleActivationRules";
import type { OperationalContextTriggerRule } from "@/types/operationalContext";

/**
 * ARGUS Operational Context Engine — reglas de activación configurables.
 *
 * El mandato original enumera triggers por nombre de fuente/color de alerta
 * ("SENAPRED Amarilla/Naranja/Roja", "GDACS Orange/Red", "FIRMS gran
 * incendio"). `ModuleIncidentSummary` (la proyección canónica que este motor
 * consume, ver `operationalContextEngine.ts`) es deliberadamente mínima y no
 * expone tags/color de alerta por fuente — y `chileAlertPromotionEngine.ts`
 * (línea ~134) ya solo promueve alertas SENAPRED a `KnowledgeIncident` en
 * severidad `high`/`critical`, es decir la distinción de color ya colapsó en
 * severidad antes de llegar aquí. Por eso las reglas son genéricas sobre
 * severidad + si la fuente es oficial (`sourceSummary.isOfficial`), no un
 * literal por agencia/color — cubre el mismo caso (alerta oficial regional en
 * severidad media, ej. "Amarilla") sin inventar un campo que no existe en la
 * proyección. Si en el futuro `ModuleIncidentSummary` suma un campo de
 * tag/nivel de alerta, una regla más específica se agrega aquí sin tocar el
 * motor.
 */
export const OPERATIONAL_CONTEXT_TRIGGER_RULES: OperationalContextTriggerRule[] = [
  { id: "critical_any_source", label: "Severidad crítica", minSeverity: "critical" },
  { id: "high_any_source", label: "Severidad alta", minSeverity: "high" },
  {
    id: "official_medium",
    label: "Alerta oficial en severidad media (ej. SENAPRED Amarilla, GDACS Orange)",
    minSeverity: "medium",
    requireOfficial: true,
  },
];

export type OperationalContextTriggerEvaluation = { activated: true; ruleId: string } | { activated: false };

/** Evalúa las reglas en orden y activa con la primera que matchea — nunca `if (threat === ...)`. */
export function evaluateOperationalContextTrigger(summary: {
  severity: OperationalContextTriggerRule["minSeverity"];
  sourceSummary: { isOfficial: boolean };
}): OperationalContextTriggerEvaluation {
  for (const rule of OPERATIONAL_CONTEXT_TRIGGER_RULES) {
    if (rule.requireOfficial && !summary.sourceSummary.isOfficial) continue;
    if (severityAtLeast(summary.severity, rule.minSeverity)) {
      return { activated: true, ruleId: rule.id };
    }
  }
  return { activated: false };
}
