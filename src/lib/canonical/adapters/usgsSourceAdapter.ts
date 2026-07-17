/**
 * ARGUS — implementación de referencia del contrato único de adaptador
 * (Prompt 4 Fase D: "consolida USGS como flujo de referencia vertical").
 *
 * Compone las funciones ya existentes y ya probadas de
 * `src/lib/knowledge-intake/adapters/usgsAdapter.ts` (el único adaptador
 * USGS-sismos que `globalWatchEngine.ts` invoca — ver
 * `docs/architecture/ARGUS_SOURCE_CONSOLIDATION_IMPLEMENTATION.md` §3 para
 * la confirmación de que es la única implementación activa de ese camino)
 * bajo la forma de `ArgusSourceAdapter`, separando explícitamente fetch,
 * normalización y validación — sin reescribir ninguna de las tres.
 *
 * Este archivo NO reemplaza `fetchUsgsEarthquakes()` (que sigue siendo lo
 * que `globalWatchEngine.ts` llama, sin cambios) — es una segunda forma de
 * invocar exactamente la misma lógica bajo el contrato formal, útil para
 * cualquier orquestador futuro que quiera tratar todas las fuentes de
 * manera uniforme (fetch/normalize/validate) sin acoplarse a la firma
 * específica de cada adaptador.
 */

import {
  fetchRawUsgsFeed,
  normalizeUsgsEarthquakeFeature,
  type UsgsGeoJson,
} from "@/lib/knowledge-intake/adapters/usgsAdapter";
import { classifySourceError } from "@/lib/vigia/sourceScheduler";
import { validateNormalizedObservation } from "@/lib/canonical/sourceAdapterContract";
import type { ArgusSourceAdapter, SourceFetchResult } from "@/lib/canonical/sourceAdapterContract";
import type { ArgusIncidentKnowledge } from "@/types/knowledgeIntake";

export const USGS_EARTHQUAKE_SOURCE_ID = "usgs_earthquake";

async function fetchUsgs(context: { timeoutMs: number }): Promise<SourceFetchResult<UsgsGeoJson>> {
  const fetchedAt = new Date().toISOString();
  try {
    const payload = await fetchRawUsgsFeed({ feed: "relevant" }, context.timeoutMs);
    return { ok: true, payload, fetchedAt };
  } catch (error) {
    return {
      ok: false,
      fetchedAt,
      errorCode: classifySourceError(error),
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

function normalizeUsgs(payload: UsgsGeoJson): ArgusIncidentKnowledge[] {
  return (payload.features ?? [])
    .map(normalizeUsgsEarthquakeFeature)
    .filter((incident): incident is ArgusIncidentKnowledge => Boolean(incident));
}

export const usgsSourceAdapter: ArgusSourceAdapter<UsgsGeoJson> = {
  sourceId: USGS_EARTHQUAKE_SOURCE_ID,
  fetch: fetchUsgs,
  normalize: normalizeUsgs,
  validate: validateNormalizedObservation,
};
