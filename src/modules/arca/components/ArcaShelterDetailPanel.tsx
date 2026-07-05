import type { ArcaShelter } from "@/modules/arca/types";
import ArcaOperationalStatusPanel from "@/modules/arca/components/ArcaOperationalStatusPanel";
import ArcaCapacityPanel from "@/modules/arca/components/ArcaCapacityPanel";
import ArcaServicesPanel from "@/modules/arca/components/ArcaServicesPanel";
import { arcaShelterTypeLabel } from "@/modules/arca/utils";

interface Props {
  shelter: ArcaShelter | null;
  showDetailedCapacity: boolean;
  showInternalNotes: boolean;
}

export default function ArcaShelterDetailPanel({ shelter, showDetailedCapacity, showInternalNotes }: Props) {
  if (!shelter) {
    return (
      <section className="border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
        <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-emerald-300">Detalle de refugio</h2>
        <p className="mt-2 text-xs text-slate-500">Selecciona un refugio de la lista para ver su detalle completo.</p>
      </section>
    );
  }

  return (
    <div className="grid gap-4">
      <section className="border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
        <p className="text-[0.6rem] font-bold uppercase tracking-[0.18em] text-emerald-300">{arcaShelterTypeLabel[shelter.type]}</p>
        <h2 className="mt-1 text-lg font-semibold text-white">{shelter.name}</h2>
        <p className="mt-1 text-xs text-slate-400">
          {shelter.location.label ?? `${shelter.location.lat.toFixed(3)}, ${shelter.location.lng.toFixed(3)}`}
          {shelter.location.isApproximate ? " (aprox.)" : ""}
        </p>
        {shelter.operator && (
          <p className="mt-1 text-[0.65rem] text-slate-500">
            Operador: {shelter.operator.name} ({shelter.operator.type})
          </p>
        )}
        {shelter.publicNotes && <p className="mt-2 text-xs text-slate-300">{shelter.publicNotes}</p>}
        {showInternalNotes && shelter.internalNotes && (
          <p className="mt-2 border border-amber-300/20 bg-amber-400/5 px-2.5 py-1.5 text-[0.65rem] text-amber-100">
            Notas internas: {shelter.internalNotes}
          </p>
        )}
      </section>

      <ArcaOperationalStatusPanel shelter={shelter} />
      <ArcaCapacityPanel shelter={shelter} showDetailed={showDetailedCapacity} />
      <ArcaServicesPanel shelter={shelter} />
    </div>
  );
}
