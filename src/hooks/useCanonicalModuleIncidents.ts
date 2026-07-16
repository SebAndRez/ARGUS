"use client";

import { useEffect, useRef, useState } from "react";
import type {
  ModuleContextResult,
  ModuleIncidentFilters,
  ModuleIncidentPage,
  ModuleIncidentSummary,
  OperationalContextModuleId,
} from "@/types/moduleOperationalContext";

/**
 * ARGUS Prompt 17 — hook cliente compartido para los cuatro dashboards
 * (ATLAS/VIGÍA/ORÁCULO/TALOS). Un solo punto que llama
 * `/api/modules/incidents` — ningún componente reimplementa su propio fetch
 * ni su propia interpretación de severidad/lifecycle (Prompt 17 §7, §22).
 *
 * Deliberadamente no cachea de forma persistente ni hace polling — cada
 * módulo decide cuándo revalidar (montaje, cambio de filtro, acción de
 * usuario); evita mostrar lifecycle obsoleto por períodos excesivos sin
 * introducir una capa de caché compleja que esta tarea no requiere (Prompt
 * 17 §22).
 */

function buildQuery(moduleId: OperationalContextModuleId, filters: ModuleIncidentFilters): string {
  const params = new URLSearchParams({ module: moduleId });
  if (filters.lifecycle?.length) params.set("lifecycle", filters.lifecycle.join(","));
  if (filters.severity?.length) params.set("severity", filters.severity.join(","));
  if (filters.verificationStatus?.length) params.set("verificationStatus", filters.verificationStatus.join(","));
  if (filters.type?.length) params.set("type", filters.type.join(","));
  if (filters.countryCode) params.set("countryCode", filters.countryCode);
  if (filters.regionCode) params.set("regionCode", filters.regionCode);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.source) params.set("source", filters.source);
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.cursor) params.set("cursor", filters.cursor);
  if (filters.includeDemo) params.set("includeDemo", "true");
  return params.toString();
}

const LOADING_RESULT = { state: "loading" as const };

export function useCanonicalModuleIncidents(
  moduleId: OperationalContextModuleId,
  filters: ModuleIncidentFilters = {}
): { state: "loading" } | ModuleContextResult<ModuleIncidentPage> {
  const [result, setResult] = useState<{ state: "loading" } | ModuleContextResult<ModuleIncidentPage>>(LOADING_RESULT);
  const filtersKey = JSON.stringify(filters);

  useEffect(() => {
    let cancelled = false;
    setResult(LOADING_RESULT);

    async function load() {
      try {
        const query = buildQuery(moduleId, JSON.parse(filtersKey) as ModuleIncidentFilters);
        const response = await fetch(`/api/modules/incidents?${query}`, { cache: "no-store" });
        const body = (await response.json()) as ModuleContextResult<ModuleIncidentPage>;
        if (!cancelled) setResult(body);
      } catch {
        if (!cancelled) {
          setResult({
            state: "unavailable",
            error: { code: "DATA_UNAVAILABLE", message: "No fue posible cargar incidentes canónicos." },
          });
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [moduleId, filtersKey]);

  return result;
}

export function useCanonicalModuleIncidentById(
  moduleId: OperationalContextModuleId,
  incidentId: string | null | undefined
): { state: "loading" } | ModuleContextResult<ModuleIncidentSummary> | null {
  const [result, setResult] = useState<{ state: "loading" } | ModuleContextResult<ModuleIncidentSummary> | null>(null);
  const requestedId = useRef<string | null>(null);

  useEffect(() => {
    if (!incidentId) {
      setResult(null);
      return;
    }
    let cancelled = false;
    requestedId.current = incidentId;
    setResult(LOADING_RESULT);

    async function load() {
      try {
        const response = await fetch(`/api/modules/incidents/${encodeURIComponent(incidentId!)}?module=${moduleId}`, {
          cache: "no-store",
        });
        const body = (await response.json()) as ModuleContextResult<ModuleIncidentSummary>;
        if (!cancelled && requestedId.current === incidentId) setResult(body);
      } catch {
        if (!cancelled && requestedId.current === incidentId) {
          setResult({
            state: "unavailable",
            error: { code: "DATA_UNAVAILABLE", message: "No fue posible cargar el incidente." },
          });
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [moduleId, incidentId]);

  return result;
}
