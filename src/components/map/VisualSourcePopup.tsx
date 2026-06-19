"use client";

import SourceTypeBadge from "@/components/ui/SourceTypeBadge";
import type { VisualSource } from "@/types/visualSource";

interface Props {
  source: VisualSource | null;
  onClose: () => void;
}

const statusPresentation: Record<
  VisualSource["status"],
  { label: string; className: string; fallbackTitle: string }
> = {
  live: {
    label: "LIVE",
    className: "border-emerald-300/30 bg-emerald-400/10 text-emerald-200",
    fallbackTitle: "VISTA EXTERNA",
  },
  offline: {
    label: "OFFLINE",
    className: "border-slate-400/30 bg-slate-500/10 text-slate-300",
    fallbackTitle: "FUENTE SIN SEÑAL",
  },
  external_only: {
    label: "EXTERNAL ONLY",
    className: "border-purple-300/30 bg-purple-400/10 text-purple-100",
    fallbackTitle: "FUENTE EXTERNA",
  },
  embed_restricted: {
    label: "EMBED RESTRICTED",
    className: "border-amber-300/30 bg-amber-400/10 text-amber-100",
    fallbackTitle: "STREAM RESTRINGIDO",
  },
};

const precisionLabels: Record<VisualSource["locationPrecision"], string> = {
  exact: "Ubicación exacta",
  venue: "Recinto aproximado",
  city: "Ciudad aproximada",
  country: "País aproximado",
  unknown: "Ubicación no confirmada",
};

function getMutedEmbedUrl(embedUrl: string) {
  try {
    const url = new URL(embedUrl);
    url.searchParams.set("autoplay", "0");
    url.searchParams.set("mute", "1");
    url.searchParams.set("muted", "1");
    return url.toString();
  } catch {
    return embedUrl;
  }
}

export default function VisualSourcePopup({ source, onClose }: Props) {
  if (!source) return null;

  const status = statusPresentation[source.status];
  const canEmbed = source.embedAllowed && Boolean(source.embedUrl);
  const confidence = Math.max(0, Math.min(100, Math.round(source.locationConfidence)));

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/65 p-3 backdrop-blur-sm sm:items-center sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="visual-source-title"
        className="max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl overflow-y-auto rounded-lg border border-cyan-300/20 bg-slate-950 shadow-2xl shadow-black/60"
      >
        <header className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <SourceTypeBadge category={source.category} />
              <span className={`rounded-md border px-2 py-1 text-[0.6rem] font-bold ${status.className}`}>
                {status.label}
              </span>
            </div>
            <h2 id="visual-source-title" className="mt-3 break-words text-xl font-semibold text-white">
              {source.title}
            </h2>
            <p className="mt-1 text-sm text-slate-400">{source.sourceName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 bg-slate-900 text-xl text-slate-300 transition hover:border-cyan-300/40 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-300/70"
            aria-label="Cerrar fuente visual"
            title="Cerrar"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </header>

        <div className="p-4 sm:p-5">
          <div className="aspect-video overflow-hidden rounded-lg border border-white/10 bg-black">
            {canEmbed ? (
              <iframe
                src={getMutedEmbedUrl(source.embedUrl!)}
                title={`Vista previa sin audio: ${source.title}`}
                className="h-full w-full"
                allow="fullscreen; picture-in-picture"
                referrerPolicy="strict-origin-when-cross-origin"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5 font-mono text-xs text-slate-300">
                  CAM
                </span>
                <p className="mt-4 text-sm font-bold uppercase text-white">{status.fallbackTitle}</p>
                <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">
                  Esta fuente no permite reproducción interna o requiere abrirse en el sitio de origen.
                </p>
              </div>
            )}
          </div>

          {canEmbed && (
            <p className="mt-2 text-xs text-slate-400">
              Vista sin audio. Abre la fuente original para escuchar o usar la experiencia completa.
            </p>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="min-w-0">
              <p className="text-[0.65rem] font-semibold uppercase text-slate-500">Ubicación</p>
              <p className="mt-1 break-words text-sm text-slate-200">{source.locationName}</p>
              <p className="mt-1 text-xs text-slate-400">
                {precisionLabels[source.locationPrecision]} · confianza de ubicación {confidence}%
              </p>
              {source.lastUpdatedLabel && <p className="mt-1 text-xs text-slate-500">{source.lastUpdatedLabel}</p>}
            </div>

            <a
              href={source.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-cyan-300/30 bg-cyan-400 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-200/80 focus:ring-offset-2 focus:ring-offset-slate-950"
            >
              {canEmbed ? "Abrir fuente original para audio" : "Abrir fuente original"}
            </a>
          </div>

          {source.description && (
            <p className="mt-4 border-t border-white/10 pt-4 text-sm leading-6 text-slate-400">{source.description}</p>
          )}
        </div>
      </section>
    </div>
  );
}
