import type { getKnowledgeIncidents } from "@/lib/knowledge-intake/persistence/knowledgePersistenceService";
import { canonicalKnowledgeIncidentToArgusEvent } from "@/lib/canonical/canonicalKnowledgeIncidentToArgusEvent";
import type { ArgusEvent } from "@/types/argusEvent";

type PersistedKnowledgeIncident = Awaited<ReturnType<typeof getKnowledgeIncidents>>[number];

/**
 * @deprecated ARGUS Prompt 9 — this file is a pure delegation to the single
 * canonical projection (`@/lib/canonical/canonicalKnowledgeIncidentToArgusEvent`),
 * kept only so any not-yet-discovered import doesn't break. New code should
 * import `canonicalKnowledgeIncidentToArgusEvent` directly with
 * `{ idPrefix: "vigia" }`. Do not add logic here — every rule that used to
 * live in this file (GDACS severity canonicalization, lifecycle→status,
 * geometry, source/confidence resolution) now lives exactly once in the
 * canonical module. See
 * docs/architecture/ARGUS_CANONICAL_PROJECTION_IMPLEMENTATION.md.
 */
export function vigiaIncidentToArgusEvent(incident: PersistedKnowledgeIncident): ArgusEvent | null {
  return canonicalKnowledgeIncidentToArgusEvent(incident, { idPrefix: "vigia" });
}
