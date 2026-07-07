"use client";

import type { NavigationGpsStatus } from "@/hooks/useNavigationSession";
import type { GeoPoint, RouteResult, RoutingMode } from "@/lib/routing/routingService";
import { buildExternalMapsUrl } from "@/lib/navigation/navigationService";

/**
 * Resumen de navegacion activa: ETA, distancia restante, proxima
 * instruccion, estado de GPS, boton de detener y boton para abrir en un mapa
 * externo (Google Maps/Apple Maps). Generico para cualquier modulo que use
 * `useNavigationSession`.
 */

const gpsStatusLabel: Record<NavigationGpsStatus, string> = {
  idle: "GPS inactivo",
  requesting: "Solicitando GPS...",
  active: "GPS activo",
  approximate: "Ubicacion aproximada",
  denied: "Permiso de ubicacion bloqueado",
  unsupported: "GPS no disponible",
  signal_lost: "Error de señal GPS",
};

const gpsStatusAccent: Record<NavigationGpsStatus, string> = {
  idle: "text-slate-400",
  requesting: "text-amber-300",
  active: "text-emerald-300",
  approximate: "text-amber-300",
  denied: "text-rose-300",
  unsupported: "text-rose-300",
  signal_lost: "text-rose-300",
};

interface Props {
  destinationLabel: string;
  origin: GeoPoint;
  destination: GeoPoint;
  selectedRoute: RouteResult | null;
  remainingDistanceKm: number;
  remainingTimeMin: number;
  nextInstruction: string | null;
  gpsStatus: NavigationGpsStatus;
  gpsMessage: string;
  offRoute: boolean;
  recalculating: boolean;
  isNavigating: boolean;
  mode: RoutingMode;
  onStart: () => void;
  onStop: () => void;
  onClose: () => void;
}

export default function NavigationHud({
  destinationLabel,
  origin,
  destination,
  selectedRoute,
  remainingDistanceKm,
  remainingTimeMin,
  nextInstruction,
  gpsStatus,
  gpsMessage,
  offRoute,
  recalculating,
  isNavigating,
  mode,
  onStart,
  onStop,
  onClose,
}: Props) {
  const openExternalNavigation = () => {
    const url = buildExternalMapsUrl(origin, destination, mode);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <section className="argus-navigation-hud pointer-events-auto grid gap-2 rounded-lg border border-cyan-300/25 bg-slate-950/94 p-3 text-xs shadow-2xl shadow-black/45 backdrop-blur-xl">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.58rem] font-bold uppercase tracking-[0.16em] text-cyan-300">Navegando hacia</p>
          <h3 className="truncate text-sm font-semibold text-white">{destinationLabel}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded border border-white/10 bg-white/[0.03] px-2 py-1 text-[0.58rem] font-bold uppercase text-slate-300"
        >
          Cerrar
        </button>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded border border-white/10 bg-white/[0.03] px-2 py-1.5">
          <p className="text-[0.55rem] uppercase text-slate-500">Distancia restante</p>
          <p className="font-bold text-white">{remainingDistanceKm.toFixed(1)} km</p>
        </div>
        <div className="rounded border border-white/10 bg-white/[0.03] px-2 py-1.5">
          <p className="text-[0.55rem] uppercase text-slate-500">ETA</p>
          <p className="font-bold text-white">{remainingTimeMin} min</p>
        </div>
      </div>

      {nextInstruction && (
        <p className="rounded border border-cyan-300/20 bg-cyan-400/8 p-2 text-[0.68rem] leading-4 text-cyan-100">
          {nextInstruction}
        </p>
      )}

      <p className={`text-[0.6rem] font-bold uppercase tracking-[0.1em] ${gpsStatusAccent[gpsStatus]}`}>
        {gpsStatusLabel[gpsStatus]}
        {gpsMessage ? ` · ${gpsMessage}` : ""}
      </p>

      {recalculating && (
        <p className="rounded border border-amber-300/20 bg-amber-400/8 p-2 text-[0.62rem] text-amber-100">
          Recalculando ruta...
        </p>
      )}
      {offRoute && !recalculating && (
        <p className="rounded border border-amber-300/20 bg-amber-400/8 p-2 text-[0.62rem] text-amber-100">
          Te desviaste de la ruta.
        </p>
      )}
      {selectedRoute?.isDemo && (
        <p className="rounded border border-amber-300/15 bg-amber-400/8 p-2 text-[0.62rem] text-amber-100">
          Ruta estimada (demo): no se pudo calcular una ruta real por calles.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        {isNavigating ? (
          <button
            type="button"
            onClick={onStop}
            className="min-h-9 rounded bg-rose-500 px-3 py-2 text-[0.65rem] font-bold uppercase text-white"
          >
            Detener navegacion
          </button>
        ) : (
          <button
            type="button"
            onClick={onStart}
            disabled={!selectedRoute}
            className="min-h-9 rounded bg-cyan-500 px-3 py-2 text-[0.65rem] font-bold uppercase text-white disabled:opacity-40"
          >
            Iniciar navegacion
          </button>
        )}
        <button
          type="button"
          onClick={openExternalNavigation}
          className="min-h-9 rounded border border-cyan-300/25 bg-cyan-400/8 px-3 py-2 text-[0.62rem] font-bold uppercase text-cyan-100"
        >
          Abrir en Maps externo
        </button>
      </div>
    </section>
  );
}
