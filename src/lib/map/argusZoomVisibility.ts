/**
 * Shared zoom/LOD (level-of-detail) rules for the operational map.
 *
 * ARGUS already had two independent, well-tuned zoom-gated systems before
 * this module existed:
 * - `@/lib/criticalPoi/criticalPoiPriority.ts` — P0/P1 from zoom 10, P2 from
 *   14, P3 from 16 (hospitals, police, government, shelters...).
 * - `@/lib/pois/poiTypes.ts` (`categoriesForZoom`) — health/transport/fuel
 *   from zoom 13, shops/restaurants/schools from zoom 15 (OSM P4 layer).
 *
 * Neither needed to change — they already do exactly what "progressive
 * disclosure" asks for. What was missing was the *rest* of the map
 * (citizen reports/SOS/alerts, conflict events, news evidence, ARGUS
 * incident events): those rendered every point unconditionally regardless
 * of zoom. This module gives them the same treatment, on a ladder that
 * slots between the two existing systems instead of inventing a
 * conflicting one:
 *
 *   zoom 0   -> always visible, but density-clustered (critical alerts, risk zones)
 *   zoom 10  -> incident-level detail reveals (matches CriticalPoi's P0/P1 tier)
 *   zoom 13  -> (existing) PoiLayer medium-priority POIs
 *   zoom 14  -> (existing) CriticalPoi P2
 *   zoom 15  -> (existing) PoiLayer urban/commerce POIs
 *   zoom 16  -> (existing) CriticalPoi P3
 */

/** Zoom at which secondary detail (incidents, news, attack points) reveals. Aligned with `CRITICAL_ZOOM_TIERS.p1`. */
export const MEDIUM_DETAIL_MIN_ZOOM = 10;

export type ArgusMapVisibilityCategory =
  /** SOS, citizen reports, active alerts — priority 1, never hidden, only clustered. */
  | "critical_alert"
  /** Official-alert / risk polygons and region references — priority 1, never hidden. */
  | "risk_zone"
  /** Specific incident markers (landslide, road closure, conflict attack point...). */
  | "incident_point"
  /** News/OSINT evidence markers. */
  | "news_evidence";

const CATEGORY_MIN_ZOOM: Record<ArgusMapVisibilityCategory, number> = {
  critical_alert: 0,
  risk_zone: 0,
  incident_point: MEDIUM_DETAIL_MIN_ZOOM,
  news_evidence: MEDIUM_DETAIL_MIN_ZOOM,
};

export function isVisibleAtZoom(category: ArgusMapVisibilityCategory, zoom: number): boolean {
  return zoom >= CATEGORY_MIN_ZOOM[category];
}

/**
 * Generic zoom-aware grid cell size (degrees) for point clustering — shrinks
 * as the user zooms in so clusters break apart naturally instead of a fixed
 * cell size that either over-clusters far away or never fully declusters up
 * close. Mirrors the shrink curve already used by `PoiLayer`'s clustering.
 */
export function resolveClusterCellSizeDeg(zoom: number): number {
  if (zoom < 4) return 3;
  if (zoom < 6) return 1.2;
  if (zoom < 8) return 0.5;
  if (zoom < 10) return 0.18;
  if (zoom < 12) return 0.06;
  if (zoom < 14) return 0.02;
  if (zoom < 16) return 0.006;
  return 0.0015;
}
