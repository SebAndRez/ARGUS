"use client";

import { useMemo, useState } from "react";
import LiveCameraMarker from "@/components/live-cameras/LiveCameraMarker";
import type { ArgusLiveCamera } from "@/types/liveCamera";

interface Props {
  cameras: ArgusLiveCamera[];
  active: boolean;
  selectedCameraId?: string;
  onSelect: (camera: ArgusLiveCamera) => void;
}

export default function LiveCameraList({
  cameras,
  active,
  selectedCameraId,
  onSelect,
}: Props) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredCameras = useMemo(() => {
    if (!normalizedQuery) return cameras.slice(0, 8);
    return cameras
      .filter((camera) =>
        [
          camera.title,
          camera.city,
          camera.region,
          camera.country,
          camera.provider,
          camera.category,
          ...camera.tags,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery)
      )
      .slice(0, 8);
  }, [cameras, normalizedQuery]);

  return (
    <section className="mt-4 border-t border-white/10 pt-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Camaras en vivo
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {active
              ? `${cameras.length} fuentes publicas disponibles`
              : "Activa la capa para mostrar marcadores"}
          </p>
        </div>
        <span
          className={`border px-2 py-1 text-[0.55rem] font-bold ${
            active
              ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-200"
              : "border-white/10 bg-white/[0.03] text-slate-500"
          }`}
        >
          {active ? "ON" : "OFF"}
        </span>
      </div>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar ciudad, fuente o categoria"
        className="mt-3 min-h-10 w-full border border-white/10 bg-slate-900/70 px-3 text-xs text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-300/40"
      />
      <div className="mt-2 grid gap-1.5">
        {filteredCameras.map((camera) => {
          const selected = camera.id === selectedCameraId;
          return (
            <button
              key={camera.id}
              type="button"
              disabled={!active}
              onClick={() => onSelect(camera)}
              className={`flex min-h-12 items-center gap-3 border px-2 py-2 text-left transition ${
                !active
                  ? "cursor-not-allowed border-white/5 bg-white/[0.02] opacity-60"
                  : selected
                    ? "border-cyan-300/35 bg-cyan-400/12"
                    : "border-white/8 bg-white/[0.03] hover:bg-white/[0.06]"
              }`}
            >
              <LiveCameraMarker camera={camera} selected={selected} />
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-slate-100">
                  {camera.title}
                </span>
                <span className="block truncate text-[0.6rem] uppercase tracking-[0.12em] text-slate-500">
                  {[camera.city, camera.country].filter(Boolean).join(", ") ||
                    camera.provider}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
