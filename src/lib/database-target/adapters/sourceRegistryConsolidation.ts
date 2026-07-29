/**
 * src/lib/database-target/adapters/sourceRegistryConsolidation.ts
 *
 * Resolves DUP-003 (Executable Migration Plan, Ola 3 §6: "Consolidación de
 * `KnowledgeSource`+`src/lib/vigia/sourceRegistry.ts`+
 * `src/lib/knowledge-intake/sourceRegistry.ts` en un único `IncidentSource`
 * lógico ... resuelta antes de poblar `ingest.sources`").
 *
 * ## Inventory (Fase 4 of the wave-3 mandate)
 *
 * | Archivo | Exportaciones | Consumidores (imports reales) | Responsabilidad | Duplicidad |
 * |---|---|---|---|---|
 * | `src/lib/vigia/sourceRegistry.ts` | `VIGIA_SOURCE_REGISTRY`, `getVigiaSource`, `isVigiaSourceConfigured`, `getVigiaSourceHealth`, types | `src/app/admin/source-health/page.tsx`, `src/app/api/vigia/events/route.ts`, `src/app/api/vigia/source-health/route.ts`, `src/lib/canonical/incidentSourceRegistry.ts`, `src/lib/observability/operationsSnapshot.ts`, `src/lib/vigia/globalAlertPromotionEngine.ts`, `src/lib/vigia/globalWatchEngine.ts`, `src/lib/vigia/wildfireCorrelationEngine.ts` (8 files) | Declara las fuentes que Global Watch consulta EN VIVO para producir `KnowledgeIncident` (cadencia, umbral de confiabilidad, rol incident/evidence/context) | SÍ — mismo `id` que una entrada de `knowledgeSourceRegistry.ts` en 7 casos (ver abajo) |
 * | `src/lib/knowledge-intake/sourceRegistry.ts` | `getAllKnowledgeSources`, `getEnabledKnowledgeSources`, `getSourcesByDomain`, `getSourcesByInputType`, `getSourceById`, `registerKnowledgeSource`, `updateKnowledgeSourceStatus`, `getKnowledgeSourceStats` | `src/app/api/knowledge-intake/health/route.ts`, `src/app/api/knowledge-intake/sources/[id]/route.ts`, `src/app/api/knowledge-intake/sources/route.ts`, `src/components/dashboard/KnowledgeIntakePanel.tsx`, `src/lib/knowledge-intake/incidentNormalizer.ts`, `src/lib/knowledge-intake/knowledgeMemoryEngine.ts`, `src/lib/knowledge-intake/persistence/knowledgeIngestionJobs.ts`, `src/lib/knowledge-intake/persistence/smithsonianGvpIngestionJobs.ts`, `src/lib/knowledge-intake/persistence/usgsEarthquakeImpactIngestionJobs.ts` (9 files) | Catálogo estático de ~65 fuentes de la base de conocimiento histórico (domains/inputTypes/licencia); no produce incidentes en vivo | Igual que arriba |
 * | `src/lib/sources/sourceRegistry.ts` (`ARGUS_SOURCE_REGISTRY`) | vista operacional de salud/confiabilidad para el panel de administración | consumidores propios, no relacionados con `ingest.sources` | Fuera de alcance DUP-003 — ya documentado como concepto #3 (distinto) en `src/lib/canonical/incidentSourceRegistry.ts` | No aplica a esta consolidación |
 * | `src/lib/canonical/incidentSourceRegistry.ts` | `resolveArgusSourceType`, `resolveIncidentSource` | capa de lectura canónica (Fase B) | YA consolida, para el propósito de `ArgusEvent`/`CanonicalIncidentSource`, un único punto de resolución sobre `VIGIA_SOURCE_REGISTRY` — precedente directo de este módulo, mismo patrón, propósito distinto (tipo de fuente de un incidente vs. catálogo de fuentes de ingesta) | No aplica — ya resuelto |
 *
 * IDs presentes en AMBOS registros hoy (drift real, no hipotético):
 * `copernicus_effis`, `gdacs`, `nasa-eonet`, `nasa_firms`, `open-meteo`,
 * `reliefweb`, `usgs_earthquake`. `senapred_eventos` (vigia) y
 * `senapred_chile` (knowledge-intake) son el mismo origen real bajo IDs
 * distintos — documentado como caso de `EXPECTED_DIFFERENCE`, nunca
 * fusionado bajo un solo id inventado.
 *
 * ## Resolución
 *
 * `src/lib/vigia/sourceRegistry.ts` y `src/lib/knowledge-intake/
 * sourceRegistry.ts` siguen existiendo sin cambios — cada uno sigue siendo
 * la única fuente de verdad de SU PROPIO pipeline en vivo (Global Watch /
 * Knowledge Intake respectivamente). Fusionarlos literalmente en un solo
 * archivo tocaría 17 archivos consumidores reales sin ningún beneficio para
 * el modelo de incidente objetivo — exactamente la conclusión ya
 * documentada por el equipo en `incidentSourceRegistry.ts` para el caso
 * análogo de `CanonicalIncidentSource` ("Fusionar las cuatro en una sola
 * tabla/registro sería un cambio de alto riesgo sin beneficio").
 *
 * Lo que SÍ se resuelve aquí, que es lo que Ola 3 necesita antes de poblar
 * `ingest.sources`/`ingest.source_connectors`: un ÚNICO punto de
 * resolución — `buildCanonicalSourceDirectory()` — que LEE EN VIVO ambos
 * registros (nunca copia sus datos a una tercera lista estática) y produce
 * una vista canónica, deduplicada por id, con el origen de cada campo
 * explícito. Este módulo es un adaptador de lectura, nunca una segunda
 * fuente de verdad: no declara ningún id/endpoint/frecuencia/capacidad por
 * sí mismo, no habilita fuentes deshabilitadas, no pierde ninguna fuente.
 * `adapters/wave3Transformers.ts` (`sourceRegistryEntryToSource`/
 * `sourceRegistryIntegrationToConnector`) consume exclusivamente esta vista,
 * nunca los registros crudos directamente.
 */

import { VIGIA_SOURCE_REGISTRY, type VigiaSourceDefinition } from "@/lib/vigia/sourceRegistry";
import { getAllKnowledgeSources } from "@/lib/knowledge-intake/sourceRegistry";
import type { ArgusKnowledgeSource } from "@/types/knowledgeIntake";

export type CanonicalSourceOrigin = "vigia" | "knowledge-intake";

/**
 * One row per distinct `id` across both registries. Never re-derives a
 * merged/guessed value for a field that differs across origins — both raw
 * records are carried verbatim so a transformer/reviewer can see exactly
 * what each pipeline declares.
 */
export interface CanonicalSourceEntry {
  id: string;
  origins: CanonicalSourceOrigin[];
  vigia: VigiaSourceDefinition | null;
  knowledgeIntake: ArgusKnowledgeSource | null;
  /** True when both origins declare this id AND disagree on `enabled`/`status` in a way that matters for `ingest.sources.is_active` (never silently resolved — surfaced for `REQUIRES_REVIEW`). */
  hasEnabledStateDrift: boolean;
}

const KNOWLEDGE_INTAKE_ENABLED_STATUSES = new Set([
  "active",
  "active_contextual",
  "active_historical",
  "active_institutional",
]);

function knowledgeIntakeIsEnabled(source: ArgusKnowledgeSource): boolean {
  return KNOWLEDGE_INTAKE_ENABLED_STATUSES.has(source.status);
}

/**
 * Builds the canonical, deduplicated source directory by reading BOTH live
 * registries fresh on every call — this function is a view, not a cache,
 * so it can never drift from either upstream registry. Read-only: never
 * mutates `VIGIA_SOURCE_REGISTRY` or the knowledge-intake runtime map.
 */
export function buildCanonicalSourceDirectory(): CanonicalSourceEntry[] {
  const vigiaById = new Map(VIGIA_SOURCE_REGISTRY.map((source) => [source.id, source]));
  const knowledgeById = new Map(getAllKnowledgeSources().map((source) => [source.id, source]));

  const allIds = new Set([...vigiaById.keys(), ...knowledgeById.keys()]);

  return [...allIds].sort().map((id) => {
    const vigia = vigiaById.get(id) ?? null;
    const knowledgeIntake = knowledgeById.get(id) ?? null;
    const origins: CanonicalSourceOrigin[] = [
      ...(vigia ? (["vigia"] as const) : []),
      ...(knowledgeIntake ? (["knowledge-intake"] as const) : []),
    ];

    const hasEnabledStateDrift =
      vigia !== null && knowledgeIntake !== null && vigia.enabled !== knowledgeIntakeIsEnabled(knowledgeIntake);

    return { id, origins, vigia, knowledgeIntake, hasEnabledStateDrift };
  });
}

export function getCanonicalSourceEntry(id: string): CanonicalSourceEntry | null {
  return buildCanonicalSourceDirectory().find((entry) => entry.id === id) ?? null;
}
