"use client";

import { useEffect, useState } from "react";
import TelecomConnectivityCard, { type TelecomConnectivityStatusDTO } from "@/components/modules/TelecomConnectivityCard";
import { loadConnectivityCache, saveConnectivityCache } from "@/lib/connectivity/connectivityOfflineCache";

/**
 * "Conectividad de emergencia" del incidente (spec ARGUS v1.0.3.6 §7): igual
 * patron que `IncidentShelterOperationalSection.tsx` — fetch por
 * lat/lng/region contra `/api/telecom-connectivity/status`, con fallback a
 * la cache local (§15, version basica) cuando la consulta falla.
 */

interface Props {
  latitude: number | null;
  longitude: number | null;
  region?: string | null;
}

type LoadState = "loading" | "ready" | "empty" | "error" | "cached";

export default function TelecomConnectivitySection({ latitude, longitude, region }: Props) {
  const [state, setState] = useState<LoadState>("loading");
  const [statuses, setStatuses] = useState<TelecomConnectivityStatusDTO[]>([]);
  const [cachedAt, setCachedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState("loading");

    const params = new URLSearchParams();
    if (region) params.set("region", region);
    if (latitude !== null) params.set("lat", String(latitude));
    if (longitude !== null) params.set("lng", String(longitude));

    fetch(`/api/telecom-connectivity/status?${params.toString()}`, { signal: AbortSignal.timeout(15_000) })
      .then((response) => response.json())
      .then((data: { statuses?: TelecomConnectivityStatusDTO[] }) => {
        if (cancelled) return;
        const result = data.statuses ?? [];
        setStatuses(result);
        saveConnectivityCache(result);
        setState(result.length > 0 ? "ready" : "empty");
      })
      .catch(() => {
        if (cancelled) return;
        const cached = loadConnectivityCache<TelecomConnectivityStatusDTO>();
        if (cached && cached.status.length > 0) {
          setStatuses(cached.status);
          setCachedAt(cached.cachedAt);
          setState("cached");
        } else {
          setState("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [latitude, longitude, region]);

  if (latitude === null && longitude === null && !region) return null;

  const relevantStatus = region ? statuses.find((item) => item.adminLevel1 === region) ?? statuses[0] ?? null : statuses[0] ?? null;

  return (
    <section className="mt-3 border-t border-white/10 pt-3">
      <h3 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-cyan-300">Conectividad de emergencia</h3>

      {state === "loading" && <p className="mt-2 text-xs text-slate-500">Consultando estado de conectividad…</p>}
      {state === "error" && <p className="mt-2 text-xs text-rose-300">No se pudo consultar conectividad de emergencia.</p>}

      {(state === "ready" || state === "empty" || state === "cached") && (
        <div className="mt-2">
          <TelecomConnectivityCard status={relevantStatus} fromCache={state === "cached"} cachedAt={cachedAt} />
        </div>
      )}
    </section>
  );
}
