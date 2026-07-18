import { prisma } from "@/lib/prisma";
import { classifyGlobalThreat } from "@/lib/vigia/threatClassifier";
import { MASTER_INCIDENT_PARENT_DOMAIN } from "@/lib/incidents/masterIncidentRules";
import { MODULE_ACTIVATION_RULES, MULTI_HAZARD_PARENT_MODULES, severityAtLeast } from "@/data/moduleActivationRules";
import type { ArgusSeverity } from "@/types/argusEvent";

/**
 * ARGUS Fusion Engine — activación automática de módulos (Tarea 4 del
 * mandato). "Automática" significa: la DECISIÓN de qué módulos son
 * relevantes no depende de que un operador la recuerde — se calcula sola a
 * partir del incidente. No significa "abrir una página sin que el usuario
 * haga clic": los módulos (`src/data/argusModules.ts`) son rutas de
 * navegación manual y siguen siéndolo (ver auditoría de módulos) — forzar
 * una navegación real sin acción del usuario no es una mejora, es un bug de
 * UX. `recommendedModules` se expone en `ArgusEvent` para que la UI muestre
 * el enlace directo.
 */

const KNOWN_SEVERITIES = new Set<ArgusSeverity>(["info", "low", "medium", "high", "critical"]);

function normalizeSeverity(value: string | null | undefined): ArgusSeverity {
  return value && KNOWN_SEVERITIES.has(value as ArgusSeverity) ? (value as ArgusSeverity) : "medium";
}

export function computeRecommendedModules(input: {
  domain: string;
  subtype: string | null;
  effectiveSeverity: string | null;
  severity: string;
}): string[] {
  const isMultiHazardParent = input.domain === MASTER_INCIDENT_PARENT_DOMAIN;
  const severity = normalizeSeverity(input.effectiveSeverity ?? input.severity);
  const threat = classifyGlobalThreat({ domain: input.domain, subtype: input.subtype });

  const modules = new Set<string>();
  for (const rule of MODULE_ACTIVATION_RULES) {
    if (rule.threat !== threat) continue;
    if (!severityAtLeast(severity, rule.minSeverity)) continue;
    rule.modules.forEach((slug) => modules.add(slug));
  }
  if (isMultiHazardParent) {
    MULTI_HAZARD_PARENT_MODULES.forEach((slug) => modules.add(slug));
  }
  return [...modules];
}

/**
 * Registra la recomendación en `AuditLog` (reutilizado, no se crea tabla
 * nueva) solo cuando el conjunto de módulos recomendados cambió desde el
 * último registro para este incidente — evita escribir una fila idéntica en
 * cada corrida de 15 min mientras el incidente sigue activo sin cambios.
 * Best-effort: nunca lanza, un fallo aquí no debe afectar la persistencia
 * principal del incidente.
 */
export async function recordModuleActivationRecommendation(incidentId: string, modules: string[]): Promise<boolean> {
  if (modules.length === 0) return false;
  try {
    const last = await prisma.auditLog.findFirst({
      where: { targetType: "KnowledgeIncident", targetId: incidentId, action: "module_activation_recommended" },
      orderBy: { createdAt: "desc" },
    });
    const lastModules: string[] = last?.metadata ? (JSON.parse(last.metadata).modules ?? []) : [];
    const sameSet = lastModules.length === modules.length && lastModules.every((slug) => modules.includes(slug));
    if (sameSet) return false;

    await prisma.auditLog.create({
      data: {
        actorUserId: null,
        action: "module_activation_recommended",
        targetType: "KnowledgeIncident",
        targetId: incidentId,
        metadata: JSON.stringify({ modules }),
      },
    });
    return true;
  } catch {
    return false;
  }
}
