"use client";

import { formatLocalAndUtcTime } from "@/lib/formatDateTime";
import type { ArgusNormalizedEvent } from "@/types/ingestion";

interface Props {
  events: ArgusNormalizedEvent[];
  status: "idle" | "loading" | "loaded" | "error";
  configured: boolean | null;
  cached: boolean;
  errorMessage: string | null;
  onRefresh: () => void;
  relatedEventIds?: string[];
}

export default function ReliefWebContextPanel({
  events,
  status,
  configured,
  cached,
  errorMessage,
  onRefresh,
  relatedEventIds = [],
}: Props) {
  return (
    <section className="mt-4 border-t border-white/10 pt-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[0.6rem] font-semibold uppercase text-slate-500">
            ReliefWeb Contexto
          </p>
          <p className="mt-1 text-xs text-slate-300">
            Impacto humanitario sin marcadores inventados
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={configured !== true || status === "loading"}
          className="min-h-9 border border-cyan-300/20 bg-cyan-400/10 px-2.5 text-[0.6rem] font-bold uppercase text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Actualizar
        </button>
      </div>

      {configured === false && (
        <p className="mt-3 border border-amber-300/20 bg-amber-400/8 p-2 text-xs text-amber-100">
          Requiere RELIEFWEB_APP_NAME.
        </p>
      )}
      {status === "loading" && (
        <p className="mt-3 text-xs text-slate-400">Consultando ReliefWeb...</p>
      )}
      {status === "error" && errorMessage && (
        <p className="mt-3 border border-red-300/20 bg-red-400/8 p-2 text-xs text-red-100">
          {errorMessage}
        </p>
      )}

      {status === "loaded" && (
        <div className="mt-3 grid gap-2">
          <p className="text-[0.6rem] uppercase text-emerald-300">
            {cached ? "Caché" : "Red / persistido"} · {events.length} reportes
          </p>
          {events.slice(0, 5).map((event) => (
            <article
              key={event.id}
              className="border border-white/8 bg-black/20 p-2.5"
            >
              <p className="text-xs font-semibold leading-5 text-white">
                {event.title}
              </p>
              <p className="mt-1 text-[0.62rem] text-slate-400">
                {event.country ?? event.locationName ?? "Cobertura global"} ·{" "}
                {formatLocalAndUtcTime(event.occurredAt).localDateTimeLabel}
              </p>
              <p className="mt-1 text-[0.62rem] text-cyan-200">
                Confianza {event.confidence}% · {event.severity}
              </p>
              {relatedEventIds.includes(event.id) && (
                <p className="mt-1 text-[0.62rem] font-semibold text-emerald-300">
                  Contexto humanitario relacionado
                </p>
              )}
              {event.url && (
                <a
                  href={event.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex text-[0.62rem] font-semibold text-cyan-300 underline"
                >
                  Abrir reporte
                </a>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
