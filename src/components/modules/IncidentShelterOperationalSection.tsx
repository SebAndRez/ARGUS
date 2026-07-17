"use client";

import { useEffect, useState } from "react";
import ShelterOperationalStatusCard from "@/components/modules/ShelterOperationalStatusCard";
import type { FenixShelter } from "@/types/fenix";

/**
 * "Situación operacional" del incidente (spec ARGUS v1.0.3.4 §13): resumen +
 * listado de refugios reales cerca del incidente. Reusa `/api/fenix/shelters`
 * (misma fuente que consume FÉNIX, ver `fenixShelterSource.ts`) en vez de
 * crear un endpoint o panel paralelo.
 */

interface Props {
  latitude: number | null;
  longitude: number | null;
  radiusKm?: number;
}

type LoadState = "loading" | "ready" | "empty" | "error";

export default function IncidentShelterOperationalSection({ latitude, longitude, radiusKm = 10 }: Props) {
  const [state, setState] = useState<LoadState>("loading");
  const [shelters, setShelters] = useState<FenixShelter[]>([]);

  useEffect(() => {
    if (latitude === null || longitude === null) return;

    let cancelled = false;
    setState("loading");

    const params = new URLSearchParams({ lat: String(latitude), lng: String(longitude), radiusKm: String(radiusKm) });
    fetch(`/api/fenix/shelters?${params.toString()}`, { signal: AbortSignal.timeout(15_000) })
      .then((response) => response.json())
      .then((data: { shelters?: FenixShelter[] }) => {
        if (cancelled) return;
        const result = data.shelters ?? [];
        setShelters(result);
        setState(result.length > 0 ? "ready" : "empty");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [latitude, longitude, radiusKm]);

  if (latitude === null || longitude === null) return null;

  const openCount = shelters.filter((shelter) => shelter.status === "available" || shelter.status === "near_capacity").length;
  const fullCount = shelters.filter((shelter) => shelter.status === "full").length;
  const closedCount = shelters.filter((shelter) => shelter.status === "closed" || shelter.status === "compromised").length;
  const staleCount = shelters.filter((shelter) => shelter.isStale).length;
  const confirmedCapacity = shelters.reduce((sum, shelter) => sum + (shelter.capacity ?? 0), 0);
  const confirmedOccupancy = shelters.reduce((sum, shelter) => sum + (shelter.currentOccupancy ?? 0), 0);
  const hasAnyCapacityData = shelters.some((shelter) => typeof shelter.capacity === "number");

  return (
    <section className="mt-3 border-t border-white/10 pt-3">
      <h3 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-cyan-300">Situación operacional</h3>

      {state === "loading" && <p className="mt-2 text-xs text-slate-500">Consultando refugios cercanos…</p>}
      {state === "error" && <p className="mt-2 text-xs text-rose-300">No se pudo consultar infraestructura de refugio.</p>}
      {state === "empty" && <p className="mt-2 text-xs text-slate-500">Sin refugios registrados dentro de {radiusKm} km.</p>}

      {state === "ready" && (
        <>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-300">
            <dt className="text-slate-500">Refugios encontrados</dt>
            <dd>{shelters.length}</dd>
            <dt className="text-slate-500">Abiertos/disponibles</dt>
            <dd>{openCount}</dd>
            <dt className="text-slate-500">Llenos</dt>
            <dd>{fullCount}</dd>
            <dt className="text-slate-500">Cerrados/no recomendados</dt>
            <dd>{closedCount}</dd>
            <dt className="text-slate-500">Con dato desactualizado</dt>
            <dd>{staleCount}</dd>
            <dt className="text-slate-500">Capacidad total confirmada</dt>
            <dd>{hasAnyCapacityData ? confirmedCapacity : "Sin información confirmada"}</dd>
            <dt className="text-slate-500">Ocupación confirmada</dt>
            <dd>{hasAnyCapacityData ? confirmedOccupancy : "Sin información confirmada"}</dd>
          </dl>

          <div className="mt-2 grid gap-2">
            {shelters.map((shelter) => (
              <ShelterOperationalStatusCard key={shelter.id} shelter={shelter} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
