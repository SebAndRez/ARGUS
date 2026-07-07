"use client";

import type { MedicalPoint } from "@/types/medical";
import type { GeoPoint, RouteResult, RoutingMode } from "@/lib/routing/routingService";
import { AURA_TRANSPORT_LABELS } from "@/lib/medical/auraMedicalRouting";
import type { LiveGpsPermission } from "@/hooks/useLiveMedicalRoute";

/**
 * Resumen compacto del atajo SOS Medico: reemplaza el panel grande de ruta
 * (`AuraMedicalRoutePanel`, que sigue existiendo dentro de AURA completo) por
 * destino + distancia + ETA + transporte + navegacion externa, sin pasos
 * intermedios.
 */

const modeCycle: RoutingMode[] = ["walking", "bike", "vehicle", "emergency_vehicle"];

const googleMapsTravelMode: Record<RoutingMode, string> = {
  walking: "walking",
  bike: "bicycling",
  vehicle: "driving",
  emergency_vehicle: "driving",
};

interface Props {
  point: MedicalPoint;
  origin: GeoPoint;
  route: RouteResult | null;
  isLoadingRoute: boolean;
  routeError: string | null;
  mode: RoutingMode;
  onModeChange: (mode: RoutingMode) => void;
  gpsPermission: LiveGpsPermission;
  gpsPermissionMessage: string;
}

export default function AuraQuickRouteSummary({
  point,
  origin,
  route,
  isLoadingRoute,
  routeError,
  mode,
  onModeChange,
  gpsPermission,
  gpsPermissionMessage,
}: Props) {
  const cycleTransport = () => {
    const nextIndex = (modeCycle.indexOf(mode) + 1) % modeCycle.length;
    onModeChange(modeCycle[nextIndex]);
  };

  const openExternalNavigation = () => {
    const travelmode = googleMapsTravelMode[mode];
    const url = `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${point.lat},${point.lng}&travelmode=${travelmode}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <section className="argus-aura-quick-route grid gap-2 rounded border border-cyan-300/25 bg-slate-900/75 p-3 text-xs">
      <header className="grid gap-0.5">
        <p className="text-[0.58rem] font-bold uppercase tracking-[0.16em] text-cyan-300">
          Ruta hacia
        </p>
        <h3 className="text-sm font-semibold text-white">{point.name}</h3>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded border border-white/10 bg-white/[0.03] px-2 py-1.5">
          <p className="text-[0.55rem] uppercase text-slate-500">Distancia</p>
          <p className="font-bold text-white">
            {isLoadingRoute && !route ? "Calculando..." : `${(route?.distanceKm ?? 0).toFixed(1)} km`}
          </p>
        </div>
        <div className="rounded border border-white/10 bg-white/[0.03] px-2 py-1.5">
          <p className="text-[0.55rem] uppercase text-slate-500">ETA</p>
          <p className="font-bold text-white">
            {isLoadingRoute && !route ? "Calculando..." : `${route?.durationMin ?? 0} min`}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={cycleTransport}
        className="flex min-h-9 items-center justify-between rounded border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[0.62rem] font-bold uppercase text-slate-200"
      >
        <span>Transporte: {AURA_TRANSPORT_LABELS[mode]}</span>
        <span className="text-cyan-300">Cambiar</span>
      </button>

      {route?.isDemo && (
        <p className="rounded border border-amber-300/15 bg-amber-400/8 p-2 text-[0.62rem] text-amber-100">
          Ruta estimada (demo): no se pudo calcular una ruta real por calles, se muestra una linea directa.
        </p>
      )}

      {routeError && !route && (
        <p className="rounded border border-rose-300/15 bg-rose-400/8 p-2 text-[0.62rem] text-rose-100">{routeError}</p>
      )}

      {gpsPermission === "denied" || gpsPermission === "unsupported" ? (
        <p className="rounded border border-amber-300/15 bg-amber-400/8 p-2 text-[0.62rem] text-amber-100">
          {gpsPermissionMessage}
        </p>
      ) : null}

      <button
        type="button"
        onClick={openExternalNavigation}
        className="min-h-9 rounded bg-cyan-500 px-3 py-2 text-[0.65rem] font-bold uppercase text-white shadow-lg shadow-cyan-950/30"
      >
        Abrir en Google Maps / Apple Maps
      </button>

      <p className="rounded border border-rose-300/15 bg-rose-400/8 p-2 text-[0.6rem] leading-4 text-rose-100">
        ARGUS entrega apoyo logistico y rutas estimadas. No entrega diagnostico medico ni garantiza atencion.
      </p>
    </section>
  );
}
