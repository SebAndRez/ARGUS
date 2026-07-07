import type { ArgusLayerId } from "@/lib/layers/layerPolicy";
import type { MapEntityType } from "@/types/mapEntity";

/**
 * Puente entre el tipo generico de punto del mapa (`MapEntityType`) y el
 * sistema de capas ya existente (`ArgusLayerId` / `layerPolicy.ts`). No
 * reemplaza `layerPolicy.ts` (que gobierna que datos procesa ARGUS): solo
 * responde "que capa visual controla la visibilidad de este tipo de punto"
 * para que la ficha ("Ver capa") y los toggles del mapa usen una unica
 * fuente de verdad por tipo de entidad.
 */

export interface LayerRegistryEntry {
  layerId: ArgusLayerId;
  label: string;
  icon: string;
}

export const MAP_ENTITY_LAYER_REGISTRY: Record<MapEntityType, LayerRegistryEntry> = {
  hospital: { layerId: "medicalPoints", label: "Hospital", icon: "🏥" },
  clinic: { layerId: "medicalPoints", label: "Clinica", icon: "🏥" },
  sapu: { layerId: "medicalPoints", label: "SAPU / Punto medico", icon: "🩺" },
  shelter: { layerId: "shelters", label: "Refugio", icon: "🏠" },
  safe_zone: { layerId: "shelters", label: "Zona segura", icon: "🛡️" },
  incident: { layerId: "reports", label: "Incidente", icon: "⚠️" },
  fire: { layerId: "reports", label: "Incendio", icon: "🔥" },
  flood: { layerId: "reports", label: "Inundacion", icon: "🌊" },
  earthquake: { layerId: "reports", label: "Sismo", icon: "🌐" },
  hazard: { layerId: "conflictZones", label: "Zona de riesgo", icon: "⚠️" },
  conflict: { layerId: "conflictZones", label: "Zona de conflicto", icon: "⚠️" },
  user: { layerId: "user", label: "Usuario", icon: "📍" },
  resource: { layerId: "medicalPoints", label: "Recurso", icon: "📦" },
  checkpoint: { layerId: "reports", label: "Punto de control", icon: "🚧" },
  custom: { layerId: "reports", label: "Punto", icon: "📌" },
};

export function getLayerRegistryEntry(type: MapEntityType): LayerRegistryEntry {
  return MAP_ENTITY_LAYER_REGISTRY[type];
}

export function isMapEntityTypeVisible(
  type: MapEntityType,
  layerFlags: Partial<Record<ArgusLayerId, boolean>>
): boolean {
  const entry = MAP_ENTITY_LAYER_REGISTRY[type];
  return layerFlags[entry.layerId] !== false;
}
