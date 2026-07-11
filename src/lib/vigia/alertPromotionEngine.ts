import type { ArgusIncidentKnowledge } from "@/types/knowledgeIntake";
import {
  classifyGlobalThreat,
  detectCriticalImpactSignals,
  maxSeverity,
  severityAtLeast,
  threatToHazardDomain,
  type GlobalThreatType,
} from "@/lib/vigia/threatClassifier";
import { dedupKeyForIncident } from "@/lib/vigia/dedup";
import { getVigiaSource, type VigiaSourceDefinition } from "@/lib/vigia/sourceRegistry";

/**
 * Motor de promoción de ARGUS Global Watch: decide, para cada evento
 * normalizado, si se convierte en `KnowledgeIncident` visible, en
 * incidente candidato ("No confirmado"), en evidencia sin incidente, o se
 * descarta como ruido.
 *
 * Reglas (en orden):
 * 1. Fuente oficial + severidad high/critical ⇒ incidente automático.
 * 2. Copernicus EFFIS/EMS + incendio activo ⇒ incidente.
 * 3. FIRMS: cluster con múltiples focos ⇒ incidente; foco aislado ⇒ candidato.
 * 4. Noticia/fuente secundaria confiable + impacto humano ⇒ candidato.
 * 5. Señales de víctimas/evacuación/alerta roja/destrucción/infraestructura
 *    crítica ⇒ severidad critical.
 * 6. Evento de alto impacto sin fuente oficial ⇒ candidato "No confirmado".
 * 7. Corroboración multi-fuente (misma clave dedup) ⇒ sube confianza
 *    (aplicada por `mergeCorroboratingEvents`).
 */

export type PromotionOutcome = "incident" | "candidate" | "evidence" | "drop";

export type PromotedEvent = {
  incident: ArgusIncidentKnowledge;
  threat: GlobalThreatType;
  dedupKey: string;
  outcome: PromotionOutcome;
  reasons: string[];
  /** Fuentes adicionales que corroboraron el mismo evento (misma clave dedup). */
  corroboratingSourceIds: string[];
  generatesNotification: boolean;
};

function textOf(incident: ArgusIncidentKnowledge): string {
  return `${incident.title} ${incident.summary}`.slice(0, 3000);
}

export function evaluateIncidentPromotion(
  incident: ArgusIncidentKnowledge,
  sourceDefinition?: VigiaSourceDefinition
): PromotedEvent {
  const source = sourceDefinition ?? getVigiaSource(incident.sourceIds[0] ?? "");
  const reasons: string[] = [];
  const threat = classifyGlobalThreat({
    domain: incident.domain,
    subtype: incident.subtype,
    title: incident.title,
    summary: incident.summary,
    tags: incident.tags,
  });

  const working: ArgusIncidentKnowledge = {
    ...incident,
    domain: threatToHazardDomain(threat),
    subtype: incident.subtype ?? threat.toLowerCase(),
  };

  // Regla 5: señales de impacto humano fuerzan severidad critical.
  const impactSignals = detectCriticalImpactSignals(textOf(working));
  if (impactSignals.shouldEscalateToCritical && !severityAtLeast(working.severity, "critical")) {
    working.severity = maxSeverity(working.severity, "critical");
    reasons.push(`Escalado a critical por señales de impacto: ${impactSignals.matched.join(", ")}.`);
  }

  const isOfficial = source?.isOfficial ?? false;
  const roleAllowsIncident = (source?.role ?? "evidence") === "incident";
  let outcome: PromotionOutcome;

  if (threat === "UNKNOWN" && working.severity !== "critical" && working.severity !== "high") {
    outcome = "evidence";
    reasons.push("Amenaza no clasificable y severidad baja: se guarda solo como evidencia.");
  } else if (isOfficial && roleAllowsIncident && severityAtLeast(working.severity, "high")) {
    outcome = "incident";
    reasons.push("Fuente oficial con severidad high/critical: incidente automático.");
  } else if ((working.sourceIds[0] === "copernicus_effis" || working.sourceIds[0] === "copernicus_ems") && threat === "WILDFIRE") {
    outcome = "incident";
    reasons.push("Copernicus EFFIS/EMS con incendio activo: incidente.");
  } else if (working.sourceIds[0] === "nasa_firms") {
    const foci = Number((working.technicalFactors as unknown as { fociCount?: number })?.fociCount ?? 1);
    if (foci >= 3 || severityAtLeast(working.severity, "high")) {
      outcome = "incident";
      reasons.push(`Cluster FIRMS con ${foci} focos: confianza suficiente para incidente.`);
    } else if (foci === 2) {
      outcome = "candidate";
      reasons.push("Cluster FIRMS de 2 focos: incidente candidato, requiere corroboración.");
    } else {
      // Un foco térmico aislado es ruido con demasiada frecuencia
      // (llamaradas industriales, quemas agrícolas): ni al mapa ni a
      // evidencia; si el fuego es real, la próxima pasada satelital o una
      // fuente oficial lo confirmará.
      outcome = "drop";
      reasons.push("Foco térmico aislado FIRMS descartado para evitar ruido.");
    }
  } else if (isOfficial && roleAllowsIncident && severityAtLeast(working.severity, "medium")) {
    outcome = "incident";
    reasons.push("Fuente oficial con severidad media: incidente visible (sin notificación).");
  } else if (!isOfficial && impactSignals.shouldEscalateToCritical) {
    outcome = "candidate";
    reasons.push("Alto impacto humano sin fuente oficial: candidato marcado como No confirmado.");
  } else if ((source?.role ?? "evidence") === "evidence" && severityAtLeast(working.severity, "high")) {
    outcome = "candidate";
    reasons.push("Fuente secundaria confiable con severidad alta: incidente candidato.");
  } else if (severityAtLeast(working.severity, "medium")) {
    outcome = "evidence";
    reasons.push("Severidad media de fuente no autorizada para crear incidentes: evidencia.");
  } else {
    outcome = "drop";
    reasons.push("Severidad baja sin corroboración: descartado para evitar ruido.");
  }

  if (outcome === "candidate") {
    working.tags = [...new Set([...working.tags, "no-confirmado", "candidate-incident"])];
    // Un candidato nunca se auto-acepta: bajar la confianza bajo el umbral
    // de auto-aceptación (80) del servicio de persistencia.
    working.confidenceScore = Math.min(working.confidenceScore, 70);
  }

  const generatesNotification =
    (outcome === "incident" || outcome === "candidate") &&
    severityAtLeast(working.severity, "high") &&
    (isOfficial || working.severity === "critical" || impactSignals.shouldEscalateToCritical);

  return {
    incident: working,
    threat,
    dedupKey: dedupKeyForIncident(working, threat),
    outcome,
    reasons,
    corroboratingSourceIds: [],
    generatesNotification,
  };
}

/**
 * Fusiona eventos promovidos que comparten clave dedup (mismo evento visto
 * por varias fuentes): gana la fuente más confiable como primaria, las
 * demás quedan como corroboración y la confianza sube (+8 por fuente
 * adicional, tope 98). Un candidato corroborado por una fuente oficial se
 * convierte en incidente confirmado.
 */
export function mergeCorroboratingEvents(promoted: PromotedEvent[]): PromotedEvent[] {
  const groups = new Map<string, PromotedEvent[]>();
  for (const event of promoted) {
    if (event.outcome === "drop") continue;
    const list = groups.get(event.dedupKey) ?? [];
    list.push(event);
    groups.set(event.dedupKey, list);
  }

  const merged: PromotedEvent[] = [];
  for (const [, group] of groups) {
    if (group.length === 1) {
      merged.push(group[0]);
      continue;
    }
    const sorted = [...group].sort(
      (a, b) => b.incident.sourceReliabilityScore - a.incident.sourceReliabilityScore
    );
    const primary = sorted[0];
    const others = sorted.slice(1);
    const extraSources = [...new Set(others.map((event) => event.incident.sourceIds[0]).filter(Boolean))];

    const boostedConfidence = Math.min(98, primary.incident.confidenceScore + extraSources.length * 8);
    const combinedSeverity = group.reduce((acc, event) => maxSeverity(acc, event.incident.severity), primary.incident.severity);
    const anyOfficial = group.some((event) => getVigiaSource(event.incident.sourceIds[0] ?? "")?.isOfficial);

    let outcome = primary.outcome;
    const reasons = [...primary.reasons, `Corroborado por ${extraSources.length} fuente(s) adicional(es): confianza ${primary.incident.confidenceScore} → ${boostedConfidence}.`];
    if (outcome === "candidate" && anyOfficial) {
      outcome = "incident";
      reasons.push("Candidato corroborado por fuente oficial: promovido a incidente confirmado.");
    }

    const tags = outcome === "incident"
      ? primary.incident.tags.filter((tag) => tag !== "no-confirmado" && tag !== "candidate-incident")
      : primary.incident.tags;

    merged.push({
      ...primary,
      outcome,
      reasons,
      corroboratingSourceIds: extraSources,
      incident: {
        ...primary.incident,
        severity: combinedSeverity,
        confidenceScore: boostedConfidence,
        evidenceCount: group.reduce((acc, event) => acc + Math.max(event.incident.evidenceCount, 1), 0),
        sourceIds: [...new Set(group.flatMap((event) => event.incident.sourceIds))],
        sourceNames: [...new Set(group.flatMap((event) => event.incident.sourceNames))],
        tags: [...new Set([...tags, "multi-source"])],
        rawEvidenceRefs: [...new Set(group.flatMap((event) => event.incident.rawEvidenceRefs))],
      },
      generatesNotification:
        primary.generatesNotification ||
        (severityAtLeast(combinedSeverity, "high") && anyOfficial),
    });
  }
  return merged;
}
