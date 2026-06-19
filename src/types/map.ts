export type BaseMapType = "tactical" | "streets" | "satellite" | "light";
export type RouteType = "terrestrial" | "air" | "maritime";

export interface ArgusRoute {
  id: string;
  title: string;
  type: RouteType;
  coordinates: Array<[latitude: number, longitude: number]>;
  status?: string;
  confidence?: number;
  description?: string;
}
