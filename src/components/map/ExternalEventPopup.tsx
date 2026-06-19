"use client";

import type { ArgusNormalizedEvent } from "@/types/ingestion";

interface Props {
  event: ArgusNormalizedEvent | null;
  onClose: () => void;
}

const severityLabels: Record<ArgusNormalizedEvent["severity"], string> = {
  low: "Atención baja",
  medium: "Atención media",
  high: "Atención alta",
  critical: "Atención crítica",
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return date.toLocaleString("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function ExternalEventPopup({ event, onClose }: Props) {
  if (!event) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/65 p-3 backdrop-blur-sm sm:items-center sm:p-6"
      role="presentation"
      onMouseDown={(mouseEvent) => {
        if (mouseEvent.target === mouseEvent.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="external-event-title"
        className="max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-lg border border-orange-300/25 bg-slate-950 shadow-2xl shadow-black/60"
      >
        <header className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-md border border-red-300/30 bg-red-500/10 px-2 py-1 text-[0.6rem] font-bold uppercase text-red-100">
                USGS · Fuente oficial
              </span>
              <span className="rounded-md border border-orange-300/30 bg-orange-500/10 px-2 py-1 text-[0.6rem] font-bold uppercase text-orange-100">
                {severityLabels[event.severity]}
              </span>
            </div>
            <h2 id="external-event-title" className="mt-3 break-words text-xl font-semibold text-white">
              {event.title}
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Publicado {formatDate(event.occurredAt)} · confianza {event.confidence}%
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 bg-slate-900 text-xl text-slate-300 transition hover:border-orange-300/40 hover:text-white"
            aria-label="Cerrar sismo"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </header>

        <div className="grid gap-4 p-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="border border-white/10 bg-slate-900/65 p-3">
              <p className="text-[0.6rem] font-semibold uppercase text-slate-500">Magnitud</p>
              <p className="mt-1 font-mono text-lg font-bold text-orange-200">
                {event.rawMagnitude?.toFixed(1) ?? "N/D"}
              </p>
            </div>
            <div className="border border-white/10 bg-slate-900/65 p-3">
              <p className="text-[0.6rem] font-semibold uppercase text-slate-500">Profundidad</p>
              <p className="mt-1 font-mono text-lg font-bold text-slate-200">
                {typeof event.rawDepthKm === "number"
                  ? `${event.rawDepthKm.toFixed(1)} km`
                  : "N/D"}
              </p>
            </div>
          </div>

          <p className="text-sm leading-6 text-slate-300">{event.description}</p>

          {event.whyItMatters && (
            <div className="border border-white/10 bg-slate-900/55 p-4">
              <p className="text-[0.62rem] font-semibold uppercase text-slate-500">
                Por qué importa
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-200">{event.whyItMatters}</p>
            </div>
          )}

          {event.recommendedAction && (
            <div className="border border-cyan-300/20 bg-cyan-400/8 p-4">
              <p className="text-[0.62rem] font-semibold uppercase text-cyan-200">
                Qué hacer ahora
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-100">{event.recommendedAction}</p>
            </div>
          )}

          {event.url && (
            <a
              href={event.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-orange-400 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-orange-300"
            >
              Abrir información oficial USGS
            </a>
          )}
        </div>
      </section>
    </div>
  );
}
