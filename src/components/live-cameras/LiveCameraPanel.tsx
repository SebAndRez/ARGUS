"use client";

import LiveCameraEmbed from "@/components/live-cameras/LiveCameraEmbed";
import type { ArgusLiveCamera } from "@/types/liveCamera";

interface Props {
  camera: ArgusLiveCamera | null;
  onClose: () => void;
}

const providerLabel: Record<ArgusLiveCamera["provider"], string> = {
  youtube: "YouTube",
  earthcam: "EarthCam",
  skylinewebcams: "SkylineWebcams",
  earthtv: "earthTV",
  other: "Fuente web",
};

const precisionLabel: Record<ArgusLiveCamera["locationPrecision"], string> = {
  exact: "Ubicacion exacta declarada",
  approximate: "Ubicacion aproximada",
  city: "Ciudad aproximada",
  unknown: "Ubicacion no confirmada",
};

export default function LiveCameraPanel({ camera, onClose }: Props) {
  if (!camera) return null;

  const locationText = [camera.city, camera.region, camera.country]
    .filter(Boolean)
    .join(", ");
  const confidence = Math.max(
    0,
    Math.min(100, Math.round(camera.locationConfidence))
  );

  return (
    <div
      className="fixed inset-0 z-[72] flex items-end justify-center bg-black/65 p-3 backdrop-blur-sm sm:items-center sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="live-camera-title"
        className="max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl overflow-y-auto rounded-lg border border-cyan-300/20 bg-slate-950 shadow-2xl shadow-black/60"
      >
        <header className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-violet-300/30 bg-violet-400/10 px-2 py-1 text-[0.6rem] font-bold uppercase text-violet-100">
                Camara en vivo
              </span>
              <span
                className={`rounded-md border px-2 py-1 text-[0.6rem] font-bold uppercase ${
                  camera.embedAllowed
                    ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-200"
                    : "border-amber-300/30 bg-amber-400/10 text-amber-100"
                }`}
              >
                {camera.embedAllowed ? "Embed activo" : "Embed restringido"}
              </span>
            </div>
            <h2
              id="live-camera-title"
              className="mt-3 break-words text-xl font-semibold text-white"
            >
              {camera.title}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              {locationText || "Ubicacion publica"} · {providerLabel[camera.provider]}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 bg-slate-900 text-lg text-slate-300 transition hover:border-cyan-300/40 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-300/70"
            aria-label="Cerrar camara"
            title="Cerrar"
          >
            x
          </button>
        </header>

        <div className="p-4 sm:p-5">
          <LiveCameraEmbed camera={camera} />

          <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="min-w-0">
              <p className="text-[0.65rem] font-semibold uppercase text-slate-500">
                Metadata operacional
              </p>
              <p className="mt-1 text-sm text-slate-200">
                {precisionLabel[camera.locationPrecision]} · confianza {confidence}%
              </p>
              <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">
                {camera.category} · {camera.markerLabel}
              </p>
            </div>
            <a
              href={camera.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-cyan-300/30 bg-cyan-400 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-200/80 focus:ring-offset-2 focus:ring-offset-slate-950"
            >
              Abrir fuente original
            </a>
          </div>

          {camera.notes && (
            <p className="mt-4 border-t border-white/10 pt-4 text-sm leading-6 text-slate-400">
              {camera.notes}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
