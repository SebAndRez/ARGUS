import type { PromotedEvent } from "@/lib/vigia/globalAlertPromotionEngine";
import { maxSeverity, severityAtLeast } from "@/lib/vigia/threatClassifier";
import { getVigiaSource } from "@/lib/vigia/sourceRegistry";
import {
  evaluateWildfireCorrelation,
  type WildfireCorrelationCandidate,
} from "@/lib/vigia/wildfireCorrelationPolicy";
import type { ArgusIncidentKnowledge } from "@/types/knowledgeIntake";

/**
 * ARGUS Prompt 15 — motor de deduplicación específico de incendios.
 *
 * Reemplaza, únicamente para eventos clasificados `WILDFIRE`, el
 * agrupamiento genérico por clave geo-temporal de
 * `mergeCorroboratingEvents` (`src/lib/vigia/globalAlertPromotionEngine.ts`) por
 * uno que usa geometría real y reglas por par de fuentes
 * (`wildfireCorrelationPolicy.ts`). El resto de las amenazas (sismos,
 * inundaciones, etc.) sigue usando `mergeCorroboratingEvents` sin cambios —
 * ver `globalWatchEngine.ts`.
 *
 * Complejidad: O(n²) comparaciones puras (sin I/O) sobre el subconjunto de
 * candidatos WILDFIRE de una sola corrida — n está acotado por diseño aguas
 * arriba (FIRMS ya limita a 100 clusters/corrida, EFFIS a `limit` filtrado
 * por área/fecha, EMS a `limit` de activaciones), nunca compara contra el
 * historial completo de incendios persistidos (Prompt 15 §23; la
 * correlación contra incidentes ya persistidos de corridas anteriores se
 * resuelve por separado en `findWildfireCorrelationCandidates`, con
 * preselección por bbox/ventana temporal, no aquí).
 */

export type WildfireObservabilityEventName =
  | "wildfire_candidate_found"
  | "wildfire_correlated"
  | "wildfire_not_correlated"
  | "wildfire_evidence_attached"
  | "wildfire_duplicate_suppressed"
  | "wildfire_correlation_ambiguous";

/** console.info estructurado (Prompt 15 §25) — nunca el payload completo, solo ids/scores/distancias. */
export function logWildfireEvent(event: WildfireObservabilityEventName, payload: Record<string, unknown>): void {
  console.info(`[argus:wildfire] ${event}`, payload);
}

function toCandidate(incident: ArgusIncidentKnowledge, threat: WildfireCorrelationCandidate["threat"]): WildfireCorrelationCandidate {
  return {
    id: incident.id,
    sourceId: incident.sourceIds[0] ?? "unknown",
    threat,
    country: incident.country,
    region: incident.region,
    geometry: incident.geometry as WildfireCorrelationCandidate["geometry"],
    latitude: incident.latitude,
    longitude: incident.longitude,
    occurredAt: incident.occurredAt,
    detectedAt: incident.detectedAt,
  };
}

class UnionFind {
  private parent = new Map<string, string>();

  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    const current = this.parent.get(x)!;
    if (current === x) return x;
    const root = this.find(current);
    this.parent.set(x, root);
    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent.set(rootA, rootB);
  }
}

/**
 * Agrupa y fusiona eventos WILDFIRE promovidos de la misma corrida usando el
 * perfil de correlación de incendios. Determinista y sin efectos sobre el
 * orden de entrada (Prompt 15 Caso 17: FIRMS antes de EFFIS produce el mismo
 * resultado que EFFIS antes de FIRMS) porque el agrupamiento es unión-find
 * simétrico y el desempate de fuente primaria usa `sourceReliabilityScore`
 * y, en último caso, orden alfabético de id — nunca el orden de llegada del
 * array.
 */
export function correlateWildfireEvents(promoted: PromotedEvent[]): PromotedEvent[] {
  const events = promoted.filter((event) => event.outcome !== "drop");
  if (events.length === 0) return [];

  const uf = new UnionFind();
  for (const event of events) uf.find(event.incident.id);

  for (let i = 0; i < events.length; i += 1) {
    for (let j = i + 1; j < events.length; j += 1) {
      const a = events[i];
      const b = events[j];
      const result = evaluateWildfireCorrelation(
        toCandidate(a.incident, a.threat),
        toCandidate(b.incident, b.threat)
      );
      if (result.decision === "merge") {
        uf.union(a.incident.id, b.incident.id);
        logWildfireEvent("wildfire_correlated", {
          a: a.incident.id,
          b: b.incident.id,
          pair: result.pairLabel,
          score: result.score,
          distanceKm: result.distanceKm,
        });
      } else if (result.decision === "candidate") {
        logWildfireEvent("wildfire_correlation_ambiguous", {
          a: a.incident.id,
          b: b.incident.id,
          pair: result.pairLabel,
          score: result.score,
        });
      } else {
        logWildfireEvent("wildfire_not_correlated", {
          a: a.incident.id,
          b: b.incident.id,
          pair: result.pairLabel,
          reason: result.reason,
        });
      }
    }
  }

  const groups = new Map<string, PromotedEvent[]>();
  for (const event of events) {
    const root = uf.find(event.incident.id);
    const list = groups.get(root) ?? [];
    list.push(event);
    groups.set(root, list);
  }

  const merged: PromotedEvent[] = [];
  for (const [, rawGroup] of groups) {
    // Orden determinista por id ascendente antes de cualquier unión de
    // arreglos (sourceIds/sourceNames/rawEvidenceRefs/tags) — el orden de
    // llegada del array de entrada nunca debe filtrarse al resultado final
    // (Caso 17).
    const group = [...rawGroup].sort((x, y) => x.incident.id.localeCompare(y.incident.id));
    if (group.length === 1) {
      merged.push(group[0]);
      logWildfireEvent("wildfire_candidate_found", {
        id: group[0].incident.id,
        sourceId: group[0].incident.sourceIds[0],
      });
      continue;
    }

    // Fuente más confiable como primaria; empate resuelto por id ascendente
    // — nunca por orden de llegada (Caso 17).
    const sorted = [...group].sort((x, y) => {
      const reliabilityDelta = y.incident.sourceReliabilityScore - x.incident.sourceReliabilityScore;
      if (reliabilityDelta !== 0) return reliabilityDelta;
      return x.incident.id.localeCompare(y.incident.id);
    });
    const primary = sorted[0];
    const originalPrimarySeverity = primary.incident.severity;
    const others = sorted.slice(1);
    const extraSources = [...new Set(others.map((event) => event.incident.sourceIds[0]).filter(Boolean))];

    const boostedConfidence = Math.min(98, primary.incident.confidenceScore + extraSources.length * 8);
    const combinedSeverity = group.reduce((acc, event) => maxSeverity(acc, event.incident.severity), primary.incident.severity);
    const anyOfficial = group.some((event) => getVigiaSource(event.incident.sourceIds[0] ?? "")?.isOfficial);

    let outcome = primary.outcome;
    const reasons = [
      ...primary.reasons,
      `Correlación de incendio (wildfireCorrelationPolicy): ${extraSources.length} fuente(s) adicional(es) agrupadas.`,
    ];
    if (outcome === "candidate" && anyOfficial) {
      outcome = "incident";
      reasons.push("Candidato de incendio corroborado por fuente institucional: promovido a incidente confirmado.");
    }

    const tags = outcome === "incident"
      ? primary.incident.tags.filter((tag) => tag !== "no-confirmado" && tag !== "candidate-incident")
      : primary.incident.tags;

    logWildfireEvent("wildfire_evidence_attached", {
      primary: primary.incident.id,
      attachedSources: extraSources,
      groupSize: group.length,
    });

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
        tags: [...new Set([...tags, "multi-source", "wildfire-correlated"])],
        rawEvidenceRefs: [...new Set(group.flatMap((event) => event.incident.rawEvidenceRefs))],
      },
      // Evidencia adicional del mismo incendio sin escalar severidad no debe
      // volver a notificar (Prompt 15 §20) — solo notifica si la fuente
      // primaria ya lo hacía, o si la corroboración realmente subió la
      // severidad efectiva por encima de la que tenía la señal primaria.
      generatesNotification:
        primary.generatesNotification ||
        (severityAtLeast(combinedSeverity, "high") && anyOfficial && combinedSeverity !== originalPrimarySeverity),
    });
  }

  return merged.sort((a, b) => a.incident.id.localeCompare(b.incident.id));
}
