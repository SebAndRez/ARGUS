import type { ArcaShelter } from "@/modules/arca/types";
import { buildArcaMapMarkers, groupArcaMarkersByLayer } from "@/modules/arca/arcaMapLayers";

interface Props {
  shelters: ArcaShelter[];
  selected: ArcaShelter | null;
}

/**
 * Panel compacto de mapa: ARCA no duplica `OperationalMap` (evitar romper
 * SSR/rendimiento). Muestra un resumen de capas de refugio y un acceso
 * directo al mapa principal.
 */
export default function ArcaShelterMapPanel({ shelters, selected }: Props) {
  const markers = buildArcaMapMarkers(shelters);
  const grouped = groupArcaMarkersByLayer(markers);

  return (
    <section className="border border-white/10 bg-slate-950/70 p-3 shadow-2xl shadow-black/30">
      <header className="mb-2 flex items-center justify-between">
        <p className="text-[0.6rem] font-bold uppercase tracking-[0.18em] text-emerald-300">Mapa de refugios</p>
        <a
          href="/app"
          className="border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[0.65rem] font-bold uppercase tracking-[0.1em] text-slate-300 hover:border-emerald-300/30 hover:text-emerald-100"
        >
          Ver mapa completo
        </a>
      </header>
      <div className="flex flex-wrap gap-2 text-[0.62rem] text-slate-400">
        <span className="border border-emerald-300/25 bg-emerald-400/8 px-2 py-1 text-emerald-100">{grouped.active} activos</span>
        <span className="border border-amber-300/25 bg-amber-400/8 px-2 py-1 text-amber-100">{grouped.limited} limitados</span>
        <span className="border border-orange-400/30 bg-orange-500/8 px-2 py-1 text-orange-100">{grouped.full} llenos</span>
        <span className="border border-cyan-300/25 bg-cyan-400/8 px-2 py-1 text-cyan-100">{grouped.safe_zone} zonas seguras</span>
        <span className="border border-white/10 bg-white/[0.02] px-2 py-1 text-slate-400">{grouped.closed} cerrados</span>
      </div>
      {selected && (
        <p className="mt-2 text-xs text-slate-300">
          Seleccionado: <strong className="text-white">{selected.name}</strong> —{" "}
          {selected.location.label ?? `${selected.location.lat.toFixed(3)}, ${selected.location.lng.toFixed(3)}`}
        </p>
      )}
    </section>
  );
}
