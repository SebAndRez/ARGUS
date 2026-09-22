"use client";

import { useEffect, useState } from "react";
import type { ArcaShelter } from "@/modules/arca/types";
import type { FenixShelter } from "@/types/fenix";
import { fenixShelterToArcaShelter } from "@/modules/arca/arcaRealShelters";

/** Search radius for real shelters around a point (same scale FÉNIX uses for incidents). */
export const REAL_SHELTER_RADIUS_KM = 25;

/**
 * Real shelters near a point, from the same source FÉNIX uses
 * (`/api/fenix/shelters?lat&lng` → `CriticalPoi` + operational status), in
 * ARCA's shape. Never returns demo shelters — callers decide on a demo
 * fallback only when the server allows it. Re-queries only on ~1 km moves.
 */
export function useNearbyRealShelters(lat: number, lng: number): { shelters: ArcaShelter[]; loaded: boolean } {
  const [state, setState] = useState<{ shelters: ArcaShelter[]; loaded: boolean }>({ shelters: [], loaded: false });
  const latKey = lat.toFixed(2);
  const lngKey = lng.toFixed(2);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ lat: latKey, lng: lngKey, radiusKm: String(REAL_SHELTER_RADIUS_KM) });
    fetch(`/api/fenix/shelters?${params.toString()}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((body: { source?: string; shelters?: FenixShelter[] }) => {
        if (cancelled) return;
        const shelters = body.source === "critical_poi" ? (body.shelters ?? []).map(fenixShelterToArcaShelter) : [];
        setState({ shelters, loaded: true });
      })
      .catch(() => {
        if (!cancelled) setState({ shelters: [], loaded: true });
      });
    return () => {
      cancelled = true;
    };
  }, [latKey, lngKey]);

  return state;
}
