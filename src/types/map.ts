export type BaseMapType = "streets" | "tactical" | "satellite" | "terrain";
export type RouteType = "terrestrial" | "air" | "maritime";

export interface ArgusRoute {
  id: string;
  title: string;
  type: RouteType;
  coordinates: Array<[latitude: number, longitude: number]>;
  status?: string;
  confidence?: number;
  description?: string;
  /** Explicit structural demo marker — see src/lib/security/demoDataGuard.ts. */
  isDemo?: boolean;
}
