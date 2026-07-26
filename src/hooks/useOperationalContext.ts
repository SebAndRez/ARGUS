"use client";

import { useEffect, useState } from "react";
import type { OperationalContextPackage } from "@/types/operationalContext";

/**
 * ARGUS Operational Context Engine — hook cliente.
 *
 * Mismo patrón de estados discriminados que `useCanonicalModuleIncidents`
 * (`src/hooks/useCanonicalModuleIncidents.ts`): `loading` ≠ `not_activated`
 * (el incidente no cumple las reglas de activación, Fase Trigger) ≠
 * `unavailable` (fallo real) — nunca se colapsan en "sin datos".
 */

export type UseOperationalContextResult =
  | { state: "loading" }
  | { state: "available"; data: OperationalContextPackage }
  | { state: "not_activated"; reason: string }
  | { state: "unavailable" };

export function useOperationalContext(incidentId: string | null | undefined): UseOperationalContextResult | null {
  const [result, setResult] = useState<UseOperationalContextResult | null>(null);

  useEffect(() => {
    if (!incidentId) {
      setResult(null);
      return;
    }

    let cancelled = false;
    setResult({ state: "loading" });

    async function load() {
      try {
        const response = await fetch(`/api/operational-context/${encodeURIComponent(incidentId as string)}`, { cache: "no-store" });
        const body = await response.json();
        if (cancelled) return;
        if (body.state === "available") {
          setResult({ state: "available", data: body.data });
        } else if (body.state === "not_activated") {
          setResult({ state: "not_activated", reason: body.reason ?? "unknown" });
        } else {
          setResult({ state: "unavailable" });
        }
      } catch {
        if (!cancelled) setResult({ state: "unavailable" });
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [incidentId]);

  return result;
}
