import { TELECOM_GUIDANCE_VERSION } from "@/content/telecomConnectivityGuidance";

/**
 * Cache local del ultimo estado de conectividad conocido (ARGUS v1.0.3.6
 * §15, version basica sin service worker — ver plan §11 para el alcance
 * diferido). Mismo patron guard de `src/lib/layers/layerState.ts`:
 * `typeof window === "undefined"` primero, try/catch alrededor de
 * localStorage (puede fallar en modo privado o cuota excedida).
 */

const STORAGE_KEY = "argus-telecom-connectivity-cache";

export interface ConnectivityCacheEntry<TStatus> {
  status: TStatus[];
  guidanceVersion: string;
  cachedAt: string;
}

export function saveConnectivityCache<TStatus>(status: TStatus[]): void {
  if (typeof window === "undefined") return;
  try {
    const entry: ConnectivityCacheEntry<TStatus> = {
      status,
      guidanceVersion: TELECOM_GUIDANCE_VERSION,
      cachedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // Cuota excedida o almacenamiento no disponible (modo privado) - la
    // cache es un beneficio best-effort, nunca bloquea la funcionalidad.
  }
}

export function loadConnectivityCache<TStatus>(): ConnectivityCacheEntry<TStatus> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ConnectivityCacheEntry<TStatus>;
  } catch {
    return null;
  }
}
