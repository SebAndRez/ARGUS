"use client";

import { useState } from "react";
import type { HermesGeoPoint, HermesMobilityMode, HermesRoutePurpose } from "@/modules/hermes/types";
import HermesMobilityModeSelector from "@/modules/hermes/components/HermesMobilityModeSelector";

interface Props {
  currentLocation: { latitude: number; longitude: number };
  onCalculate: (input: { origin: HermesGeoPoint; destination: HermesGeoPoint; mode: HermesMobilityMode; purpose: HermesRoutePurpose }) => void;
  onClear: () => void;
  isCalculating: boolean;
}

export default function HermesRoutePlanner({ currentLocation, onCalculate, onClear, isCalculating }: Props) {
  const [useCurrentLocation, setUseCurrentLocation] = useState(true);
  const [originLat, setOriginLat] = useState(String(currentLocation.latitude));
  const [originLng, setOriginLng] = useState(String(currentLocation.longitude));
  const [destLat, setDestLat] = useState("");
  const [destLng, setDestLng] = useState("");
  const [mode, setMode] = useState<HermesMobilityMode>("car");
  const [purpose, setPurpose] = useState<HermesRoutePurpose>("safe_navigation");
  const [error, setError] = useState<string | null>(null);

  function handleCalculate() {
    setError(null);
    const origin = useCurrentLocation
      ? { lat: currentLocation.latitude, lng: currentLocation.longitude }
      : { lat: Number(originLat), lng: Number(originLng) };
    const destination = { lat: Number(destLat), lng: Number(destLng) };

    if (!Number.isFinite(origin.lat) || !Number.isFinite(origin.lng) || !Number.isFinite(destination.lat) || !Number.isFinite(destination.lng)) {
      setError("Ingresa un origen y destino válidos.");
      return;
    }

    onCalculate({ origin, destination, mode, purpose });
  }

  function handleClear() {
    setDestLat("");
    setDestLng("");
    setError(null);
    onClear();
  }

  return (
    <section className="border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
      <h2 className="mb-2 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-teal-300">Planificador de ruta</h2>

      <label className="mb-2 flex items-center gap-2 text-xs text-slate-300">
        <input type="checkbox" checked={useCurrentLocation} onChange={(event) => setUseCurrentLocation(event.target.checked)} />
        Usar mi ubicación actual como origen
      </label>

      {!useCurrentLocation && (
        <div className="mb-2 grid gap-2 sm:grid-cols-2">
          <input
            value={originLat}
            onChange={(event) => setOriginLat(event.target.value)}
            placeholder="Latitud origen"
            className="border border-white/10 bg-slate-900/90 px-3 py-2 text-sm text-white placeholder:text-slate-600"
          />
          <input
            value={originLng}
            onChange={(event) => setOriginLng(event.target.value)}
            placeholder="Longitud origen"
            className="border border-white/10 bg-slate-900/90 px-3 py-2 text-sm text-white placeholder:text-slate-600"
          />
        </div>
      )}

      <div className="mb-2 grid gap-2 sm:grid-cols-2">
        <input
          value={destLat}
          onChange={(event) => setDestLat(event.target.value)}
          placeholder="Latitud destino"
          className="border border-white/10 bg-slate-900/90 px-3 py-2 text-sm text-white placeholder:text-slate-600"
        />
        <input
          value={destLng}
          onChange={(event) => setDestLng(event.target.value)}
          placeholder="Longitud destino"
          className="border border-white/10 bg-slate-900/90 px-3 py-2 text-sm text-white placeholder:text-slate-600"
        />
      </div>

      <HermesMobilityModeSelector mode={mode} onModeChange={setMode} purpose={purpose} onPurposeChange={setPurpose} />

      {error && <p className="mt-2 border border-red-400/25 bg-red-500/8 px-3 py-2 text-xs text-red-200">{error}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleCalculate}
          disabled={isCalculating}
          className="min-h-11 flex-1 border border-teal-300/30 bg-teal-400/12 px-4 text-sm font-bold uppercase tracking-[0.06em] text-teal-100 transition hover:bg-teal-400/20 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9 sm:flex-none"
        >
          {isCalculating ? "Calculando..." : "Calcular ruta"}
        </button>
        <button
          type="button"
          onClick={handleClear}
          className="min-h-11 border border-white/10 bg-white/[0.03] px-4 text-sm font-semibold text-slate-300 sm:min-h-9"
        >
          Limpiar
        </button>
      </div>

      <p className="mt-2 text-[0.62rem] leading-4 text-slate-500">
        Ruta estimada en modo demo. La integración con motor de routing real queda preparada.
      </p>
    </section>
  );
}
