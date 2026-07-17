import type { BriefingComparisonEntry, BriefingComparisonResult, OperationalBriefingContext } from "@/types/operationalBriefing";

/**
 * ARGUS — comparación estructurada entre dos contextos operacionales
 * (Prompt 8 §16/§30). Compara el CONTEXTO estructurado, nunca el texto final
 * del briefing — exactamente lo que el mandato exige ("no comparar
 * solamente texto final"). Pura, sin I/O: recibe dos
 * `OperationalBriefingContext` ya construidos (p.ej. una versión persistida
 * anterior y la actual) — este módulo no decide de dónde viene la versión
 * previa (no hay persistencia en este pase, ver deuda técnica).
 */

function entry(field: string, kind: BriefingComparisonEntry["kind"], from: string | null, to: string | null): BriefingComparisonEntry {
  return { field, kind, from, to };
}

const SEVERITY_RANK: Record<string, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
const CONFIDENCE_RANK: Record<string, number> = { low: 0, medium: 1, medium_high: 2, high: 3, verified: 4 };

export function compareBriefingContexts(
  previous: OperationalBriefingContext | null,
  current: OperationalBriefingContext
): BriefingComparisonResult {
  if (!previous) {
    return { hasMaterialChanges: false, entries: [] };
  }

  // El propio hash ya resume si algo relevante cambió — evita comparar
  // campo por campo cuando el contexto es idéntico (mandato §50: no
  // regenerar/comparar por cambios no materiales).
  if (previous.contextHash === current.contextHash) {
    return { hasMaterialChanges: false, entries: [] };
  }

  const entries: BriefingComparisonEntry[] = [];

  if (previous.incident.severity !== current.incident.severity) {
    const rankDelta = (SEVERITY_RANK[current.incident.severity] ?? 0) - (SEVERITY_RANK[previous.incident.severity] ?? 0);
    entries.push(entry("severity", rankDelta > 0 ? "INCREASED" : "DECREASED", previous.incident.severity, current.incident.severity));
  }

  if (previous.incident.confidence !== current.incident.confidence) {
    const rankDelta = (CONFIDENCE_RANK[current.incident.confidence] ?? 0) - (CONFIDENCE_RANK[previous.incident.confidence] ?? 0);
    entries.push(entry("confidence", rankDelta > 0 ? "INCREASED" : "DECREASED", previous.incident.confidence, current.incident.confidence));
  }

  if (previous.incident.lifecycle !== current.incident.lifecycle) {
    entries.push(entry("lifecycle", "CHANGED", previous.incident.lifecycle, current.incident.lifecycle));
  }

  const prevAreas = new Set(previous.territory.intersectedAdministrativeAreas);
  const currAreas = new Set(current.territory.intersectedAdministrativeAreas);
  const newAreas = [...currAreas].filter((area) => !prevAreas.has(area));
  const removedAreas = [...prevAreas].filter((area) => !currAreas.has(area));
  newAreas.forEach((area) => entries.push(entry("territory", "ADDED", null, area)));
  removedAreas.forEach((area) => entries.push(entry("territory", "REMOVED", area, null)));

  const prevAffected = new Set(
    previous.infrastructure.filter((asset) => asset.spatialRelation === "INSIDE" || asset.spatialRelation === "BORDER").map((asset) => asset.poiId)
  );
  const currAffected = new Set(
    current.infrastructure.filter((asset) => asset.spatialRelation === "INSIDE" || asset.spatialRelation === "BORDER").map((asset) => asset.poiId)
  );
  if (prevAffected.size !== currAffected.size) {
    entries.push(
      entry(
        "affectedInfrastructureCount",
        currAffected.size > prevAffected.size ? "INCREASED" : "DECREASED",
        String(prevAffected.size),
        String(currAffected.size)
      )
    );
  }

  if (previous.priority.level !== current.priority.level) {
    entries.push(entry("priority", "CHANGED", previous.priority.level, current.priority.level));
  }

  return { hasMaterialChanges: entries.length > 0, entries };
}
