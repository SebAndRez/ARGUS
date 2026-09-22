"use client";

import { useEffect, useState } from "react";
import type { MedicalPoint } from "@/types/medical";

/**
 * Nearby medical points from `/api/medical-points` — real `CriticalPoi` health
 * facilities; the server only returns the AURA demo fixture where demo data is
 * allowed. Re-queries only when the position moves ~1 km (2-decimal key).
 */
export function useNearbyMedicalPoints(lat: number, lng: number): {
  points: MedicalPoint[];
  source: "critical_poi" | "demo" | "unavailable" | "loading";
} {
  const [state, setState] = useState<{ points: MedicalPoint[]; source: "critical_poi" | "demo" | "unavailable" | "loading" }>({
    points: [],
    source: "loading",
  });
  const latKey = lat.toFixed(2);
  const lngKey = lng.toFixed(2);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/medical-points?lat=${latKey}&lng=${lngKey}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((body: { source?: "critical_poi" | "demo" | "unavailable"; points?: MedicalPoint[] }) => {
        if (!cancelled) setState({ points: body.points ?? [], source: body.source ?? "unavailable" });
      })
      .catch(() => {
        if (!cancelled) setState({ points: [], source: "unavailable" });
      });
    return () => {
      cancelled = true;
    };
  }, [latKey, lngKey]);

  return state;
}
