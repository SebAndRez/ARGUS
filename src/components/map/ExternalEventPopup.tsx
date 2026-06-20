"use client";

import type { ArgusNormalizedEvent } from "@/types/ingestion";
import type { ArgusCorrelatedIncident } from "@/types/correlation";

interface Props {
  event: ArgusNormalizedEvent | null;
  onClose: () => void;
  correlations?: ArgusCorrelatedIncident[];
}

const severityLabels: Record<ArgusNormalizedEvent["severity"], string> = {
  low: "Atención baja",
  medium: "Atención media",
  high: "Atención alta",
  critical: "Atención crítica",
};

const categoryLabels: Partial<Record<ArgusNormalizedEvent["category"], string>> = {
  earthquake: "Terremoto",
  flood: "Inundación",
  cyclone: "Ciclón",
  volcano: "Volcán",
  drought: "Sequía",
  wildfire: "Incendio forestal",
  unknown: "Desastre",
  tsunami: "Tsunami",
  thermal_anomaly: "Foco térmico",
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return date.toLocaleString("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function ExternalEventPopup({
  event,
  onClose,
  correlations = [],
}: Props) {
  if (!event) return null;

  const isGdacs = event.sourceId === "gdacs";
  const isNoaa = event.sourceId === "noaa_tsunami";
  const isFirms = event.sourceId === "nasa_firms";
  const sourceShortName = isGdacs
    ? "GDACS"
    : isNoaa
      ? "NOAA"
      : isFirms
        ? "NASA FIRMS"
        : "USGS";

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
                {sourceShortName} · Fuente institucional
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
            aria-label="Cerrar evento externo"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </header>

        <div className="grid gap-4 p-5">
          {isGdacs || isNoaa || isFirms ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="border border-white/10 bg-slate-900/65 p-3">
                <p className="text-[0.6rem] font-semibold uppercase text-slate-500">Tipo</p>
                <p className="mt-1 text-sm font-bold text-orange-200">
                  {categoryLabels[event.category] ?? "Desastre"}
                </p>
              </div>
              <div className="border border-white/10 bg-slate-900/65 p-3">
                <p className="text-[0.6rem] font-semibold uppercase text-slate-500">
                  {isNoaa
                    ? "Mensaje NOAA"
                    : isFirms
                      ? "Detección térmica"
                      : "Alerta GDACS"}
                </p>
                <p className="mt-1 font-mono text-sm font-bold uppercase text-slate-200">
                  {isNoaa
                    ? event.rawMessageType ?? "unknown"
                    : isFirms
                      ? event.instrument ?? event.satellite ?? "satelital"
                    : event.rawAlertLevel ?? "unknown"}
                </p>
              </div>
            </div>
          ) : (
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
          )}

          {isFirms &&
            (typeof event.rawFrp === "number" ||
              typeof event.rawBrightness === "number") && (
              <div className="grid grid-cols-2 gap-3">
                <div className="border border-white/10 bg-slate-900/65 p-3">
                  <p className="text-[0.6rem] font-semibold uppercase text-slate-500">
                    FRP
                  </p>
                  <p className="mt-1 font-mono text-sm font-bold text-orange-200">
                    {typeof event.rawFrp === "number"
                      ? `${event.rawFrp.toFixed(1)} MW`
                      : "N/D"}
                  </p>
                </div>
                <div className="border border-white/10 bg-slate-900/65 p-3">
                  <p className="text-[0.6rem] font-semibold uppercase text-slate-500">
                    Brillo térmico
                  </p>
                  <p className="mt-1 font-mono text-sm font-bold text-slate-200">
                    {typeof event.rawBrightness === "number"
                      ? event.rawBrightness.toFixed(1)
                      : "N/D"}
                  </p>
                </div>
              </div>
            )}

          {event.locationName && (
            <div className="border border-white/10 bg-slate-900/55 p-4">
              <p className="text-[0.62rem] font-semibold uppercase text-slate-500">
                Ubicación
              </p>
              <p className="mt-2 text-sm text-slate-200">{event.locationName}</p>
            </div>
          )}

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

          {correlations.length > 0 && (
            <section className="border border-cyan-300/20 bg-cyan-400/8 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[0.62rem] font-semibold uppercase text-cyan-200">
                  Fuentes relacionadas
                </p>
                <span className="font-mono text-[0.65rem] font-bold text-cyan-100">
                  {correlations.length}
                </span>
              </div>
              <div className="mt-3 grid gap-3">
                {correlations.slice(0, 3).map((correlation) => (
                  <div
                    key={correlation.id}
                    className="border-t border-cyan-200/10 pt-3 first:border-t-0 first:pt-0"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-white">
                        {correlation.sourceIds
                          .map((sourceId) =>
                            sourceId === "usgs_earthquake"
                              ? "USGS"
                              : sourceId === "noaa_tsunami"
                                ? "NOAA"
                                : sourceId.toUpperCase()
                          )
                          .join(" + ")}
                      </span>
                      <span className="font-mono text-[0.65rem] text-emerald-300">
                        {correlation.confidence}% confianza
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-cyan-100">
                      {correlation.title}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-300">
                      {correlation.explanation}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-slate-200">
                      {correlation.recommendedAction}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {event.url && (
            <a
              href={event.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-orange-400 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-orange-300"
            >
              Abrir información oficial {sourceShortName}
            </a>
          )}
        </div>
      </section>
    </div>
  );
}
