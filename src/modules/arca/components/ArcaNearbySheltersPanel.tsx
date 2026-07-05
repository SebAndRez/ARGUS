import type { ArcaShelter } from "@/modules/arca/types";
import { scoreArcaShelterSuitability } from "@/modules/arca/arcaSuitability";
import { arcaShelterStatusLabel, arcaShelterStatusTone, formatArcaDistance } from "@/modules/arca/utils";

interface Props {
  shelters: ArcaShelter[];
  userLocation?: { lat: number; lng: number };
  onPlanRoute?: (shelter: ArcaShelter) => void;
}

/**
 * Vista para usuario común: refugios cercanos, capacidad pública, servicios
 * básicos y advertencias — sin notas internas.
 */
export default function ArcaNearbySheltersPanel({ shelters, userLocation, onPlanRoute }: Props) {
  const ranked = shelters
    .filter((shelter) => shelter.isPublic !== false)
    .map((shelter) => ({ shelter, suitability: scoreArcaShelterSuitability(shelter, { userLocation }) }))
    .sort((a, b) => b.suitability.score - a.suitability.score)
    .slice(0, 5);

  return (
    <section className="border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
      <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-emerald-300">Refugios cercanos</h2>
      <div className="mt-2 space-y-2">
        {ranked.map(({ shelter, suitability }) => (
          <div key={shelter.id} className="border border-white/10 bg-white/[0.02] p-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-white">{shelter.name}</p>
              <span className={`border px-1.5 py-0.5 text-[0.55rem] font-bold uppercase ${arcaShelterStatusTone[shelter.status]}`}>
                {arcaShelterStatusLabel[shelter.status]}
              </span>
            </div>
            <p className="mt-1 text-[0.65rem] text-slate-500">{formatArcaDistance(shelter.location, userLocation)}</p>
            {suitability.warnings.length > 0 && (
              <p className="mt-1 text-[0.6rem] text-amber-300/80">⚠ {suitability.warnings[0]}</p>
            )}
            <button
              type="button"
              onClick={() => onPlanRoute?.(shelter)}
              className="mt-2 w-full border border-teal-300/30 bg-teal-400/10 px-3 py-1.5 text-[0.6rem] font-bold uppercase text-teal-100"
            >
              Sugerir ruta con HERMES
            </button>
          </div>
        ))}
        {ranked.length === 0 && <p className="text-xs text-slate-500">Sin refugios cercanos disponibles.</p>}
      </div>
      <p className="mt-3 text-[0.6rem] leading-4 text-slate-500">
        Refugio activo con capacidad disponible estimada. Verifique instrucciones oficiales antes de desplazarse.
      </p>
    </section>
  );
}
