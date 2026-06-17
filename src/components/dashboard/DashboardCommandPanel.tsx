"use client";

import type { CrisisEvent } from "@/types/crisis";
import MapLayerControls from "@/components/map/MapLayerControls";

interface Props {
  events: CrisisEvent[];
  layers: {
    reports: boolean;
    sos: boolean;
    alerts: boolean;
    critical: boolean;
    resolved: boolean;
    user: boolean;
  };
  onToggleLayer: (key: keyof Props["layers"]) => void;
  onSelectEvent: (event: CrisisEvent) => void;
}

export default function DashboardCommandPanel({ events, layers, onToggleLayer, onSelectEvent }: Props) {
  return (
    <aside className="flex h-full flex-col gap-6 rounded-[32px] border border-white/10 bg-slate-950/85 p-5 shadow-2xl shadow-black/30 backdrop-blur-xl xl:w-[320px]">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-300/80">Panel táctico</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">Activa capas, filtra amenazas y selecciona un foco para el seguimiento.</p>
      </div>
      <MapLayerControls layers={layers} onToggle={onToggleLayer} />
      <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-4">
        <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-[0.24em] text-slate-400">
          <span>Incidentes recientes</span>
          <span className="text-slate-300">{events.length}</span>
        </div>
        <div className="space-y-3">
          {events.slice(0, 5).map((event) => (
            <button
              key={event.id}
              type="button"
              onClick={() => onSelectEvent(event)}
              className="w-full rounded-3xl border border-white/10 bg-black/30 px-4 py-3 text-left text-sm text-slate-200 transition hover:border-cyan-400/40 hover:bg-cyan-500/10"
            >
              <p className="font-semibold text-white">{event.title}</p>
              <p className="mt-1 text-xs text-slate-400">{event.category} · {event.status}</p>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
