import {
  enforceLayerPolicy,
  getDefaultLayerState,
  type ArgusLayerId,
} from "@/lib/layers/layerPolicy";
import type { ArgusLayerFlags } from "@/types/argusLayers";

export const LAYER_SETTINGS_STORAGE_KEY = "argus-layer-settings";

/**
 * The persisted/runtime layer state is a plain boolean map — this is the
 * *visual* preference (`visible`), kept for backward compatibility with the
 * existing single-boolean `MapLayerState`. It intentionally does not store
 * `dataActive`: that flag is always re-derived from policy
 * (`getDataActiveState` / `enforceLayerPolicy`) so a stale/tampered
 * localStorage value can never disable realtime processing.
 */
export function readStoredLayerState(
  storageKey: string = LAYER_SETTINGS_STORAGE_KEY
): Record<ArgusLayerId, boolean> {
  if (typeof window === "undefined") return getDefaultLayerState();
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return getDefaultLayerState();

    const parsed = JSON.parse(raw) as ArgusLayerFlags;
    const booleanPreferences = Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => typeof value === "boolean")
    ) as ArgusLayerFlags;

    return getDefaultLayerState(booleanPreferences);
  } catch {
    return getDefaultLayerState();
  }
}

export function persistLayerState(
  state: ArgusLayerFlags,
  storageKey: string = LAYER_SETTINGS_STORAGE_KEY
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(enforceLayerPolicy(state)));
  } catch {
    // Storage can be unavailable in Safari private mode or when quota is exceeded.
  }
}
