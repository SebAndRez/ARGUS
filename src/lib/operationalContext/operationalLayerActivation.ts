import type { MapLayerState } from "@/components/map/MapLayerControls";
import type { OperationalResourceCandidate, ThreatResourceProfile } from "@/types/operationalContext";

/**
 * ARGUS Operational Context Engine — Fase 6 (Automatic Layer Activation).
 *
 * `MapLayerState` no tiene un toggle por categoría (hospital vs. policía vs.
 * bomberos) hoy — solo capas más gruesas (`criticalPois`, `medicalPoints`,
 * `shelters`). Para esas tres, solo se activan si de verdad apareció un
 * recurso de esa familia (nunca "prender todo por si acaso"); el resto de
 * `layerKeys` del perfil son capas de contexto de amenaza (FIRMS, USGS,
 * tsunami, rutas, etc.) que se activan siempre que el motor activó — no
 * dependen de conteo de POIs porque no son capas de POI.
 */

const MEDICAL_CATEGORIES = new Set(["hospital", "clinic", "emergency_care", "pharmacy"]);
const SHELTER_CATEGORIES = new Set(["shelter"]);

export function buildLayerActivationPatch(
  profile: ThreatResourceProfile,
  resources: OperationalResourceCandidate[]
): Partial<MapLayerState> {
  const poiResources = resources.filter((resource) => resource.kind === "critical_poi");
  const hasAnyPoiResource = poiResources.length > 0;
  const hasMedicalResource = poiResources.some((resource) => MEDICAL_CATEGORIES.has(resource.category as string));
  const hasShelterResource = poiResources.some((resource) => SHELTER_CATEGORIES.has(resource.category as string));

  const patch: Partial<MapLayerState> = {};
  for (const key of profile.layerKeys) {
    if (key === "criticalPois") {
      if (hasAnyPoiResource) patch.criticalPois = true;
      continue;
    }
    if (key === "medicalPoints") {
      if (hasMedicalResource) patch.medicalPoints = true;
      continue;
    }
    if (key === "shelters") {
      if (hasShelterResource) patch.shelters = true;
      continue;
    }
    patch[key] = true;
  }
  return patch;
}
