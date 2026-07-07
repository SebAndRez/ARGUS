"use client";

import type { MapEntity } from "@/types/mapEntity";
import { getLayerRegistryEntry } from "@/lib/layers/layerRegistry";
import { estimateEtaMinutes } from "@/lib/medical/auraMedicalRouting";

/**
 * Ficha compacta estilo Google Maps: se abre al tocar cualquier punto del
 * mapa (hospital, refugio, incidente, zona de riesgo...). Reemplaza el salto
 * directo a un panel pesado (AuraMedicalPanel, EventDetailPanel,
 * ConflictZonePanel) — esos paneles solo se abren si el usuario pide mas
 * detalle desde aca ("Abrir AURA completo", "Ver detalle", etc).
 */

const statusLabels: Record<NonNullable<MapEntity["status"]>, string> = {
  available: "Disponible",
  limited: "Limitada",
  unknown: "N/D",
  closed: "Cerrado",
  active: "Activo",
  resolved: "Resuelto",
};

const statusAccent: Record<NonNullable<MapEntity["status"]>, string> = {
  available: "border-emerald-300/30 bg-emerald-400/10 text-emerald-100",
  active: "border-rose-300/30 bg-rose-400/10 text-rose-100",
  limited: "border-amber-300/30 bg-amber-400/10 text-amber-100",
  unknown: "border-slate-300/20 bg-white/[0.03] text-slate-300",
  closed: "border-slate-300/20 bg-white/[0.03] text-slate-400",
  resolved: "border-cyan-300/25 bg-cyan-400/8 text-cyan-100",
};

const moduleLabels: Record<NonNullable<MapEntity["sourceModule"]>, string> = {
  aura: "AURA",
  fenix: "FENIX",
  atlas: "ATLAS",
  vigia: "VIGIA",
  hermes: "HERMES",
  nexus: "NEXUS",
  oraculo: "ORACULO",
  core: "ARGUS",
};

interface Props {
  entity: MapEntity;
  onClose: () => void;
  onRoute?: (entity: MapEntity) => void;
  onOpenModule?: (entity: MapEntity) => void;
  onViewDetail?: (entity: MapEntity) => void;
  onReportUpdate?: (entity: MapEntity) => void;
  onAvoidZone?: (entity: MapEntity) => void;
  onViewCapacity?: (entity: MapEntity) => void;
  onToggleLayer?: (entity: MapEntity) => void;
  onSafeRoute?: (entity: MapEntity) => void;
}

export default function MapEntityCard({
  entity,
  onClose,
  onRoute,
  onOpenModule,
  onViewDetail,
  onReportUpdate,
  onAvoidZone,
  onViewCapacity,
  onToggleLayer,
  onSafeRoute,
}: Props) {
  const registryEntry = getLayerRegistryEntry(entity.type);
  const isMedical = entity.type === "hospital" || entity.type === "clinic" || entity.type === "sapu";
  const isShelter = entity.type === "shelter" || entity.type === "safe_zone";
  const isIncident =
    entity.type === "incident" || entity.type === "fire" || entity.type === "flood" || entity.type === "earthquake";
  const isHazard = entity.type === "hazard" || entity.type === "conflict";

  return (
    <section className="argus-map-entity-card pointer-events-auto fixed inset-x-0 bottom-4 z-[64] mx-auto grid w-[380px] max-w-[calc(100%-2rem)] gap-2 rounded-lg border border-cyan-300/20 bg-slate-950/96 p-3 text-xs shadow-2xl shadow-black/50 backdrop-blur-xl">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <span aria-hidden className="mt-0.5 text-lg leading-none">
            {registryEntry.icon}
          </span>
          <div className="min-w-0">
            <p className="text-[0.58rem] font-bold uppercase tracking-[0.16em] text-cyan-300">
              {registryEntry.label}
              {entity.isDemo ? " · demo" : ""}
            </p>
            <h3 className="truncate text-sm font-semibold text-white">{entity.name}</h3>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded border border-white/10 bg-white/[0.03] px-2 py-1 text-[0.58rem] font-bold uppercase text-slate-300"
        >
          Cerrar
        </button>
      </header>

      {entity.description && <p className="text-slate-400">{entity.description}</p>}

      {entity.capabilities && entity.capabilities.length > 0 && (
        <p className="text-slate-400">{entity.capabilities.slice(0, 4).join(" / ")}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {entity.distanceKm !== undefined && (
          <span className="rounded-full border border-cyan-300/15 bg-cyan-400/8 px-2 py-1 text-[0.6rem] font-bold uppercase text-cyan-100">
            {entity.distanceKm.toFixed(1)} km · ETA {estimateEtaMinutes(entity.distanceKm, "vehicle")} min
          </span>
        )}
        {entity.status && (
          <span className={`rounded-full border px-2 py-1 text-[0.58rem] font-bold uppercase ${statusAccent[entity.status]}`}>
            {statusLabels[entity.status]}
          </span>
        )}
        {entity.sourceModule && (
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[0.58rem] font-bold uppercase text-slate-400">
            {moduleLabels[entity.sourceModule]}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {isMedical && (
          <>
            {onRoute && (
              <button
                type="button"
                onClick={() => onRoute(entity)}
                className="min-h-9 rounded bg-cyan-500 px-3 py-2 text-[0.62rem] font-bold uppercase text-white"
              >
                Ruta
              </button>
            )}
            {onOpenModule && (
              <button
                type="button"
                onClick={() => onOpenModule(entity)}
                className="min-h-9 rounded border border-rose-300/25 bg-rose-400/8 px-3 py-2 text-[0.62rem] font-bold uppercase text-rose-100"
              >
                Abrir AURA
              </button>
            )}
          </>
        )}

        {isShelter && (
          <>
            {onRoute && (
              <button
                type="button"
                onClick={() => onRoute(entity)}
                className="min-h-9 rounded bg-cyan-500 px-3 py-2 text-[0.62rem] font-bold uppercase text-white"
              >
                Ruta
              </button>
            )}
            {onViewCapacity && (
              <button
                type="button"
                onClick={() => onViewCapacity(entity)}
                className="min-h-9 rounded border border-white/10 bg-white/[0.03] px-3 py-2 text-[0.62rem] font-bold uppercase text-slate-200"
              >
                Capacidad
              </button>
            )}
            {onOpenModule && (
              <button
                type="button"
                onClick={() => onOpenModule(entity)}
                className="col-span-2 min-h-9 rounded border border-emerald-300/25 bg-emerald-400/8 px-3 py-2 text-[0.62rem] font-bold uppercase text-emerald-100"
              >
                Abrir FENIX
              </button>
            )}
          </>
        )}

        {isIncident && (
          <>
            {onViewDetail && (
              <button
                type="button"
                onClick={() => onViewDetail(entity)}
                className="min-h-9 rounded bg-cyan-500 px-3 py-2 text-[0.62rem] font-bold uppercase text-white"
              >
                Ver detalle
              </button>
            )}
            {onReportUpdate && (
              <button
                type="button"
                onClick={() => onReportUpdate(entity)}
                className="min-h-9 rounded border border-white/10 bg-white/[0.03] px-3 py-2 text-[0.62rem] font-bold uppercase text-slate-200"
              >
                Reportar actualizacion
              </button>
            )}
            {onAvoidZone && (
              <button
                type="button"
                onClick={() => onAvoidZone(entity)}
                className="col-span-2 min-h-9 rounded border border-amber-300/25 bg-amber-400/8 px-3 py-2 text-[0.62rem] font-bold uppercase text-amber-100"
              >
                Evitar zona
              </button>
            )}
          </>
        )}

        {isHazard && (
          <>
            {onToggleLayer && (
              <button
                type="button"
                onClick={() => onToggleLayer(entity)}
                className="min-h-9 rounded border border-white/10 bg-white/[0.03] px-3 py-2 text-[0.62rem] font-bold uppercase text-slate-200"
              >
                Ver capa
              </button>
            )}
            {onSafeRoute && (
              <button
                type="button"
                onClick={() => onSafeRoute(entity)}
                className="min-h-9 rounded bg-emerald-500 px-3 py-2 text-[0.62rem] font-bold uppercase text-white"
              >
                Ruta segura
              </button>
            )}
            {onOpenModule && (
              <button
                type="button"
                onClick={() => onOpenModule(entity)}
                className="min-h-9 rounded border border-cyan-300/25 bg-cyan-400/8 px-3 py-2 text-[0.62rem] font-bold uppercase text-cyan-100"
              >
                Abrir ATLAS
              </button>
            )}
            {onViewDetail && (
              <button
                type="button"
                onClick={() => onViewDetail(entity)}
                className="min-h-9 rounded border border-white/10 bg-white/[0.03] px-3 py-2 text-[0.62rem] font-bold uppercase text-slate-300"
              >
                Ver detalle
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
