import type { ArcaGeoPoint, ArcaShelter, ArcaShelterStatus } from "@/modules/arca/types";
import { calculateArcaCapacityStatus } from "@/modules/arca/arcaCapacity";

export interface ArcaMapMarker {
  id: string;
  name: string;
  status: ArcaShelterStatus;
  location: ArcaGeoPoint;
  layer: "active" | "full" | "limited" | "closed" | "safe_zone";
}

/**
 * Prepara marcadores de refugios para superponer en el mapa operativo. No
 * duplica `OperationalMap` — solo produce datos livianos que un panel
 * (compacto o futuro overlay) puede consumir sin recalcular geometría.
 */
export function buildArcaMapMarkers(shelters: ArcaShelter[]): ArcaMapMarker[] {
  return shelters.map((shelter) => {
    const capacityStatus = calculateArcaCapacityStatus(shelter);
    let layer: ArcaMapMarker["layer"] = "active";
    if (shelter.status === "closed") layer = "closed";
    else if (shelter.type === "safe_zone" || shelter.type === "evacuation_point") layer = "safe_zone";
    else if (capacityStatus === "full" || capacityStatus === "over_capacity") layer = "full";
    else if (capacityStatus === "limited" || capacityStatus === "near_full") layer = "limited";

    return {
      id: shelter.id,
      name: shelter.name,
      status: shelter.status,
      location: shelter.location,
      layer,
    };
  });
}

export function groupArcaMarkersByLayer(markers: ArcaMapMarker[]): Record<ArcaMapMarker["layer"], number> {
  return {
    active: markers.filter((m) => m.layer === "active").length,
    full: markers.filter((m) => m.layer === "full").length,
    limited: markers.filter((m) => m.layer === "limited").length,
    closed: markers.filter((m) => m.layer === "closed").length,
    safe_zone: markers.filter((m) => m.layer === "safe_zone").length,
  };
}
