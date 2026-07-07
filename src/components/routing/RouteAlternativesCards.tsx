"use client";

import type { RouteResult } from "@/lib/routing/routingService";

/**
 * Tarjetas compactas de rutas alternativas (mas rapida / mas corta / mas
 * segura / alternativa), tipo Google Maps/Waze. Al presionar una tarjeta se
 * selecciona y resalta esa ruta en el mapa; iniciar navegacion es una accion
 * aparte (boton en NavigationHud).
 */

interface Props {
  routes: RouteResult[];
  selectedRouteId?: string | null;
  onSelect: (route: RouteResult) => void;
}

const labelAccent: Record<NonNullable<RouteResult["label"]>, string> = {
  fastest: "border-cyan-300/35 bg-cyan-400/10 text-cyan-100",
  shortest: "border-violet-300/35 bg-violet-400/10 text-violet-100",
  safest: "border-emerald-300/35 bg-emerald-400/10 text-emerald-100",
  alternative: "border-slate-300/25 bg-white/[0.03] text-slate-200",
};

export default function RouteAlternativesCards({ routes, selectedRouteId, onSelect }: Props) {
  if (routes.length === 0) return null;

  return (
    <div className="argus-route-alternatives pointer-events-auto flex gap-2 overflow-x-auto pb-1">
      {routes.map((route) => {
        const isSelected = route.id === selectedRouteId;
        const accent = route.label ? labelAccent[route.label] : labelAccent.alternative;
        return (
          <button
            key={route.id}
            type="button"
            onClick={() => onSelect(route)}
            className={`min-w-[9.5rem] shrink-0 rounded border p-2.5 text-left text-xs transition ${
              isSelected ? accent : "border-white/10 bg-slate-900/70 text-slate-300 hover:border-white/25"
            }`}
          >
            <p className="text-[0.56rem] font-bold uppercase tracking-[0.14em] opacity-80">{route.title ?? "Ruta"}</p>
            <p className="mt-1 text-sm font-bold">{route.durationMin} min</p>
            <p className="text-[0.62rem] opacity-80">{route.distanceKm.toFixed(1)} km</p>
            {route.label === "safest" && route.routeSafetyLabel && (
              <p className="mt-1 text-[0.56rem] leading-3 opacity-80">{route.routeSafetyLabel}</p>
            )}
            {route.isDemo && (
              <p className="mt-1 text-[0.56rem] font-bold uppercase text-amber-300">Ruta estimada (demo)</p>
            )}
          </button>
        );
      })}
    </div>
  );
}
