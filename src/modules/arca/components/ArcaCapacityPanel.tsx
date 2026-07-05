import type { ArcaShelter } from "@/modules/arca/types";
import { calculateArcaCapacityStatus, getArcaAvailableCapacity } from "@/modules/arca/arcaCapacity";
import { arcaCapacityStatusLabel, formatArcaRelativeTime } from "@/modules/arca/utils";

interface Props {
  shelter: ArcaShelter;
  showDetailed: boolean;
}

export default function ArcaCapacityPanel({ shelter, showDetailed }: Props) {
  const capacityStatus = calculateArcaCapacityStatus(shelter);
  const available = getArcaAvailableCapacity(shelter);

  return (
    <section className="border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
      <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-emerald-300">Capacidad</h2>
      <p className="mt-2 text-sm font-semibold text-white">{arcaCapacityStatusLabel[capacityStatus]}</p>
      {showDetailed ? (
        <dl className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-300">
          <div>
            <dt className="text-[0.6rem] uppercase text-slate-500">Total</dt>
            <dd className="font-semibold text-white">{shelter.capacity.total ?? "N/D"}</dd>
          </div>
          <div>
            <dt className="text-[0.6rem] uppercase text-slate-500">Ocupación</dt>
            <dd className="font-semibold text-amber-200">{shelter.capacity.currentOccupancy ?? "N/D"}</dd>
          </div>
          <div>
            <dt className="text-[0.6rem] uppercase text-slate-500">Disponible</dt>
            <dd className="font-semibold text-emerald-200">{available ?? "N/D"}</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-1 text-xs text-slate-400">
          {available !== null ? `Cupo disponible estimado: ${available}.` : "Capacidad detallada no disponible públicamente."}
        </p>
      )}
      <p className="mt-2 text-[0.62rem] text-slate-500">
        {shelter.capacity.isEstimated ? "Dato estimado" : "Dato reportado"} · Actualizado {formatArcaRelativeTime(shelter.capacity.lastUpdatedAt ?? shelter.updatedAt)}
      </p>
    </section>
  );
}
