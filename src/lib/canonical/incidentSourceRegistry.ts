/**
 * ARGUS — resolución única de `IncidentSource` (Fase A, punto 4 de
 * `docs/architecture/ARGUS_INCIDENT_MIGRATION_PLAN.md`).
 *
 * La auditoría original (`ARGUS_CANONICAL_INCIDENT_DESIGN.md` §5.2)
 * encontró tres registros de fuente. Una inspección más reciente confirmó
 * que hay en realidad **cuatro** conceptos separados con propósitos
 * distintos:
 *   1. `src/lib/vigia/sourceRegistry.ts` (`VIGIA_SOURCE_REGISTRY`) — las
 *      fuentes que **producen `KnowledgeIncident`** vía Global Watch (la
 *      única de las cuatro que alimenta el incidente canónico). Es la
 *      fuente de verdad que este módulo consolida.
 *   2. `src/lib/knowledge-intake/sourceRegistry.ts` — catálogo estático de
 *      ~65 fuentes de la base de conocimiento histórico (documentos,
 *      lecciones aprendidas). No produce incidentes en vivo.
 *   3. `src/lib/sources/sourceRegistry.ts` (`ARGUS_SOURCE_REGISTRY`) — vista
 *      operacional de salud/confiabilidad para el panel de administración.
 *   4. `src/lib/sources/countrySourceRegistry.ts` — packs de configuración
 *      de ingesta por país, consumidos por los normalizadores de entrada.
 *
 * Fusionar las cuatro en una sola tabla/registro sería un cambio de alto
 * riesgo sin beneficio para el modelo de incidente (2-4 no producen
 * `Incident`s) — decisión documentada en
 * `docs/architecture/ARGUS_CANONICAL_READ_LAYER_IMPLEMENTATION.md` §3. Este
 * módulo consolida únicamente el propósito relevante al incidente
 * canónico: **un único punto de resolución `sourceId → CanonicalIncidentSource`**,
 * reemplazando la función `sourceTypeFor` que antes vivía duplicada dentro
 * de `canonicalKnowledgeIncidentToArgusEvent.ts`.
 */

import { getVigiaSource } from "@/lib/vigia/sourceRegistry";
import type { ArgusSourceType } from "@/types/argusEvent";
import type { CanonicalIncidentSource } from "@/types/canonicalIncident";

/**
 * `news_evidence` es evidencia curada, no un feed del registry Global
 * Watch en el sentido de "fuente que produce incidentes" — preserva
 * exactamente el caso especial que ya existía en el mapeador legacy.
 */
const NEWS_EVIDENCE_SOURCE_ID = "news_evidence";

/** Fuente por defecto cuando `sourceId` no está en el registry — nunca se asume oficial. */
const UNKNOWN_SOURCE: CanonicalIncidentSource = {
  id: "unknown",
  name: "Fuente no registrada",
  type: "global_feed",
  isOfficial: false,
  reliabilityScore: 0,
};

/**
 * Resuelve el tipo de fuente ARGUS (`ArgusSourceType`) para un `sourceId` —
 * único punto de esta decisión, reemplaza el `sourceTypeFor` local
 * duplicado que existía en `canonicalKnowledgeIncidentToArgusEvent.ts`.
 * Comportamiento preservado exactamente: `news_evidence` → `"news"`; fuente
 * no encontrada → `"global_feed"`; fuente oficial → `"official"`; fuente de
 * solo contexto → `"model_context"`; el resto → `"global_feed"`.
 */
export function resolveArgusSourceType(sourceId: string): ArgusSourceType {
  if (sourceId === NEWS_EVIDENCE_SOURCE_ID) return "news";
  const definition = getVigiaSource(sourceId);
  if (!definition) return "global_feed";
  if (definition.isOfficial) return "official";
  return definition.role === "context" ? "model_context" : "global_feed";
}

/**
 * Resuelve la fuente canónica completa para un `sourceId` — usada por la
 * capa de lectura canónica (Fase B) para construir `CanonicalIncidentSource`
 * sin volver a leer `VIGIA_SOURCE_REGISTRY` directamente en cada sitio.
 */
export function resolveIncidentSource(sourceId: string, sourceName?: string): CanonicalIncidentSource {
  if (sourceId === NEWS_EVIDENCE_SOURCE_ID) {
    return {
      id: sourceId,
      name: sourceName ?? "NewsEvidence (prensa curada, fuente secundaria)",
      type: "news",
      isOfficial: false,
      reliabilityScore: 60,
    };
  }

  const definition = getVigiaSource(sourceId);
  if (!definition) {
    return { ...UNKNOWN_SOURCE, id: sourceId, name: sourceName ?? UNKNOWN_SOURCE.name };
  }

  return {
    id: definition.id,
    name: definition.name,
    type: resolveArgusSourceType(sourceId),
    isOfficial: definition.isOfficial,
    reliabilityScore: definition.reliabilityScore,
  };
}
