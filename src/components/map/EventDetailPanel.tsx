"use client";

import type { CrisisEvent } from "@/types/crisis";

interface Props {
  event: CrisisEvent | null;
  onCenter?: (event: CrisisEvent) => void;
}

const severityBadge: Record<CrisisEvent["severity"], string> = {
  LOW: "bg-emerald-500/15 text-emerald-300",
  MEDIUM: "bg-orange-500/15 text-orange-300",
  HIGH: "bg-red-500/15 text-red-300",
  CRITICAL: "bg-red-600/15 text-red-200",
};

export default function EventDetailPanel({ event, onCenter }: Props) {
  if (!event) {
    return (
      <div className="rounded-[32px] border border-white/10 bg-slate-950/90 p-6 text-slate-400 shadow-2xl shadow-black/30 backdrop-blur-xl">
        <p className="text-sm uppercase tracking-[0.24em] text-cyan-300/75">Selecciona un incidente en el mapa</p>
        <p className="mt-3 text-sm leading-6 text-slate-300">La sección mostrará detalles tácticos del evento seleccionado.</p>
      </div>
    );
  }

  return (
    <div className="rounded-[32px] border border-white/10 bg-slate-950/90 p-6 shadow-2xl shadow-black/30 backdrop-blur-xl">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-300/75">Evento seleccionado</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">{event.title}</h2>
          <p className="mt-1 text-sm text-slate-400">{event.category}</p>
        </div>
        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${severityBadge[event.severity]}`}>
          {event.severity}
        </span>
      </div>

      <div className="grid gap-4 text-sm text-slate-300">
        <p>{event.description}</p>
        <div className="grid gap-2 rounded-3xl bg-white/5 p-4">
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.24em] text-slate-400">
            <span>Tipo</span>
            <span>{event.type}</span>
          </div>
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.24em] text-slate-400">
            <span>Estado</span>
            <span>{event.status}</span>
          </div>
        </div>
        <div className="rounded-3xl bg-slate-900/90 p-4">
          <div className="grid gap-3 text-sm text-slate-300">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Recomendación demo</p>
              <p className="mt-2 text-sm text-slate-100">{event.aiRecommendation}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Confianza IA</p>
              <p className="mt-1 text-sm text-cyan-300">{event.aiConfidence}</p>
            </div>
          </div>
        </div>
        <div className="grid gap-2 rounded-3xl bg-white/5 p-4 text-xs text-slate-400">
          <div className="flex justify-between">
            <span>Coordenadas</span>
            <span>{event.latitude.toFixed(4)}, {event.longitude.toFixed(4)}</span>
          </div>
          <div className="flex justify-between">
            <span>Hora</span>
            <span>{new Date(event.createdAt).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })}</span>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onCenter?.(event)}
        className="mt-6 inline-flex items-center justify-center rounded-3xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
      >
        Centrar evento
      </button>
    </div>
  );
}
