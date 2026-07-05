"use client";

import OperationalMap from "@/components/map/OperationalMap";
import type { CrisisEvent } from "@/types/crisis";
import type { MapLayerState } from "@/components/map/MapLayerControls";
import type { BaseMapType } from "@/types/map";
import type { UserLocationStatus } from "@/types/crisis";

interface Props {
  events: CrisisEvent[];
  selectedEventId?: string;
  onEventSelect: (event: CrisisEvent) => void;
  location: { latitude: number; longitude: number };
  locationStatus: UserLocationStatus;
  layerSettings: MapLayerState;
  baseMapType: BaseMapType;
  activeLayerCount: number;
}

/**
 * ATLAS reutiliza el mapa operacional real (`OperationalMap`) en vez de
 * duplicar lógica de mapa. Este panel solo agrega el encabezado ejecutivo y
 * un acceso rápido al mapa ciudadano completo.
 */
export default function AtlasOperationalMapPanel({
  events,
  selectedEventId,
  onEventSelect,
  location,
  locationStatus,
  layerSettings,
  baseMapType,
  activeLayerCount,
}: Props) {
  return (
    <section className="flex min-h-[420px] flex-col border border-white/10 bg-slate-950/70 shadow-2xl shadow-black/30">
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5">
        <div>
          <p className="text-[0.6rem] font-bold uppercase tracking-[0.18em] text-cyan-300">
            Vista operacional
          </p>
          <p className="text-xs text-slate-400">{activeLayerCount} capas activas</p>
        </div>
        <a
          href="/app"
          className="border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[0.65rem] font-bold uppercase tracking-[0.1em] text-slate-300 hover:border-cyan-300/30 hover:text-cyan-100"
        >
          Ver mapa completo
        </a>
      </header>
      <div className="relative min-h-[380px] flex-1">
        <OperationalMap
          events={events}
          selectedEventId={selectedEventId}
          onEventSelect={onEventSelect}
          location={location}
          locationStatus={locationStatus}
          layerSettings={layerSettings}
          baseMapType={baseMapType}
        />
      </div>
    </section>
  );
}
