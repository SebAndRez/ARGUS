import type { CriticalPriority } from "@/lib/criticalPoi/criticalPoiTypes";

/**
 * Reglas de zoom y clustering por prioridad (seccion 7/8 del pedido).
 * Un solo lugar de verdad para que el layer del mapa y la API de lectura
 * coincidan en que se ve a que zoom, y para que el clustering nunca sea "un
 * numero generico" que esconda P0/P1.
 */

export const CRITICAL_ZOOM_TIERS = {
  /** Por debajo: nada individual, solo agregados P0/P1 por ciudad/zona. */
  cityAggregate: 10,
  /** P0/P1 visibles individualmente desde aca. */
  p1: 10,
  /** Se suma P2. */
  p2: 14,
  /** Se suma P3 (y la capa generica P4 de src/lib/pois toma el relevo). */
  p3: 16,
} as const;

/** Prioridades a mostrar (como puntos individuales) para un zoom dado. Vacio bajo cityAggregate: ese caso lo resuelve `shouldShowCityAggregate`. */
export function prioritiesVisibleAtZoom(zoom: number): CriticalPriority[] {
  if (zoom < CRITICAL_ZOOM_TIERS.cityAggregate) return [];
  if (zoom < CRITICAL_ZOOM_TIERS.p2) return ["P0", "P1"];
  if (zoom < CRITICAL_ZOOM_TIERS.p3) return ["P0", "P1", "P2"];
  return ["P0", "P1", "P2", "P3"];
}

export function shouldShowCityAggregate(zoom: number): boolean {
  return zoom < CRITICAL_ZOOM_TIERS.cityAggregate;
}

export interface ClusterConfig {
  /** Si es falso, cada punto de esa prioridad se dibuja individual siempre, nunca se agrupa. */
  clusterEligible: boolean;
  /** Tamaño de celda de grilla en grados; mas chico = agrupa menos. */
  cellSizeDeg: number;
  /** Cuantos puntos de esa prioridad tienen que caer en una celda antes de agrupar. */
  clusterThreshold: number;
}

/**
 * Regla 8: no clustering fuerte para P0/P1 (quedan practicamente siempre
 * individuales — threshold alto), moderado para P2/P3, agresivo para P4
 * (ese vive en `src/lib/pois/PoiLayer.tsx`, no aca).
 */
export function getClusterConfigForPriority(priority: CriticalPriority): ClusterConfig {
  switch (priority) {
    case "P0":
    case "P1":
      return { clusterEligible: true, cellSizeDeg: 0.01, clusterThreshold: 25 };
    case "P2":
      return { clusterEligible: true, cellSizeDeg: 0.01, clusterThreshold: 12 };
    case "P3":
      return { clusterEligible: true, cellSizeDeg: 0.015, clusterThreshold: 8 };
    case "P4":
    default:
      return { clusterEligible: true, cellSizeDeg: 0.004, clusterThreshold: 3 };
  }
}

/** Un cluster es "critico" (necesita el badge especial, no un numero generico) si contiene al menos un punto P0/P1. */
export function isCriticalCluster(prioritiesInCluster: CriticalPriority[]): boolean {
  return prioritiesInCluster.some((priority) => priority === "P0" || priority === "P1");
}
