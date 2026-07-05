"use client";

import { useState } from "react";
import type { UserLocationStatus } from "@/types/crisis";

interface Props {
  latitude: number;
  longitude: number;
  status: UserLocationStatus;
  onRefresh: () => void;
  onManualLocation: (lat: number, lng: number) => void;
  isApproximate: boolean;
  onToggleApproximate: (value: boolean) => void;
}

/**
 * Ubicación del reporte: usa GPS si hay permiso, permite override manual si
 * no, y deja marcar explícitamente cuando la ubicación mostrada a otros
 * usuarios debe ser aproximada (obligatorio para reportes que involucran
 * personas).
 */
export default function VigiaLocationPanel({
  latitude,
  longitude,
  status,
  onRefresh,
  onManualLocation,
  isApproximate,
  onToggleApproximate,
}: Props) {
  const [manualMode, setManualMode] = useState(false);
  const [manualLat, setManualLat] = useState(String(latitude));
  const [manualLng, setManualLng] = useState(String(longitude));

  return (
    <div className="grid gap-2 border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-300">Ubicación del reporte</p>
        <span className="text-[0.62rem] uppercase text-slate-500">
          {status === "granted" ? "GPS activo" : status === "denied" ? "GPS denegado" : "GPS pendiente"}
        </span>
      </div>

      {!manualMode ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <span>
            {latitude.toFixed(4)}, {longitude.toFixed(4)}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onRefresh} className="text-cyan-300 hover:text-cyan-200">
              Actualizar GPS
            </button>
            <button type="button" onClick={() => setManualMode(true)} className="text-slate-400 hover:text-white">
              Ingresar manualmente
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            value={manualLat}
            onChange={(event) => setManualLat(event.target.value)}
            placeholder="Latitud"
            className="border border-white/10 bg-slate-900/90 px-3 py-2 text-sm text-white"
          />
          <input
            value={manualLng}
            onChange={(event) => setManualLng(event.target.value)}
            placeholder="Longitud"
            className="border border-white/10 bg-slate-900/90 px-3 py-2 text-sm text-white"
          />
          <div className="flex gap-2 sm:col-span-2">
            <button
              type="button"
              onClick={() => {
                const lat = Number(manualLat);
                const lng = Number(manualLng);
                if (Number.isFinite(lat) && Number.isFinite(lng)) {
                  onManualLocation(lat, lng);
                  setManualMode(false);
                }
              }}
              className="border border-cyan-300/30 bg-cyan-400/10 px-3 py-1.5 text-xs font-bold uppercase text-cyan-100"
            >
              Usar esta ubicación
            </button>
            <button type="button" onClick={() => setManualMode(false)} className="text-xs text-slate-400 hover:text-white">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <label className="mt-1 flex items-center gap-2 text-[0.68rem] text-slate-400">
        <input
          type="checkbox"
          checked={isApproximate}
          onChange={(event) => onToggleApproximate(event.target.checked)}
        />
        Mostrar ubicación aproximada (recomendado si el reporte involucra personas)
      </label>
    </div>
  );
}
