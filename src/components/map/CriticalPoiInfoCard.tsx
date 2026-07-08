"use client";

import type { GeoPoint } from "@/lib/routing/routingService";
import type { CriticalPoi } from "@/lib/criticalPoi/criticalPoiTypes";
import { priorityLabels } from "@/lib/criticalPoi/criticalPoiTypes";
import { getCriticalPoiCategory } from "@/lib/criticalPoi/criticalPoiCategoryRegistry";
import { buildExternalMapsUrl } from "@/lib/navigation/navigationService";

/**
 * Ficha simple de infraestructura critica (seccion 9 del pedido): nombre,
 * categoria, prioridad, estado, fuente, distancia, y acciones incluyendo
 * "Usar en modulo correspondiente" — a diferencia de `PoiInfoCard.tsx` (P4
 * generico, sin prioridad/modulo) y de `MapEntityCard.tsx` (datasets
 * curados AURA/ARCA), esta ficha es la de infraestructura persistente OSM.
 */

const statusLabels: Record<CriticalPoi["status"], string> = {
  active: "Activo",
  unknown: "Estado sin verificar",
  closed: "Cerrado",
  temporary: "Temporal",
};

const sourceLabels: Record<CriticalPoi["source"], string> = {
  osm: "OpenStreetMap",
  wikidata: "Wikidata",
  official_open_data: "Datos abiertos oficiales",
  manual: "Carga manual ARGUS",
  argus: "ARGUS",
};

function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const radiusKm = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * radiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

interface Props {
  poi: CriticalPoi;
  userLocation?: GeoPoint;
  onClose: () => void;
  onRoute?: (poi: CriticalPoi) => void;
  onViewDetail?: (poi: CriticalPoi) => void;
  onReportUpdate?: (poi: CriticalPoi) => void;
  onUseInModule?: (poi: CriticalPoi) => void;
}

export default function CriticalPoiInfoCard({
  poi,
  userLocation,
  onClose,
  onRoute,
  onViewDetail,
  onReportUpdate,
  onUseInModule,
}: Props) {
  const categoryDef = getCriticalPoiCategory(poi.category);
  const distanceKm = userLocation ? haversineKm(userLocation, { lat: poi.lat, lng: poi.lng }) : undefined;
  const externalMapsUrl = userLocation
    ? buildExternalMapsUrl(userLocation, { lat: poi.lat, lng: poi.lng }, "vehicle")
    : `https://www.google.com/maps/search/?api=1&query=${poi.lat},${poi.lng}`;
  const primaryModule = categoryDef?.moduleUse[0];

  return (
    <section className="argus-critical-poi-info-card pointer-events-auto fixed inset-x-0 bottom-4 z-[64] mx-auto grid w-[360px] max-w-[calc(100%-2rem)] gap-2 rounded-lg border border-rose-300/25 bg-slate-950/96 p-3 text-xs shadow-2xl shadow-black/50 backdrop-blur-xl">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.58rem] font-bold uppercase tracking-[0.16em] text-rose-300">
            {categoryDef?.label ?? poi.category} · {priorityLabels[poi.priority]}
          </p>
          <h3 className="truncate text-sm font-semibold text-white">{poi.name}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded border border-white/10 bg-white/[0.03] px-2 py-1 text-[0.58rem] font-bold uppercase text-slate-300"
        >
          Cerrar
        </button>
      </header>

      {!categoryDef?.wellMappedInOsm && (
        <p className="text-[0.62rem] text-amber-200">
          Clasificación por tag OSM poco estandarizado para esta categoría: verificar localmente antes de decisiones operativas.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {distanceKm !== undefined && (
          <span className="rounded-full border border-cyan-300/15 bg-cyan-400/8 px-2 py-1 text-[0.6rem] font-bold uppercase text-cyan-100">
            {formatDistance(distanceKm)}
          </span>
        )}
        <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[0.58rem] font-bold uppercase text-slate-300">
          {statusLabels[poi.status]}
        </span>
        <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[0.58rem] font-bold uppercase text-slate-400">
          {sourceLabels[poi.source]} · {poi.confidence}%
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {onRoute && (
          <button
            type="button"
            onClick={() => onRoute(poi)}
            className="min-h-9 rounded bg-cyan-500 px-3 py-2 text-[0.62rem] font-bold uppercase text-white"
          >
            Ruta
          </button>
        )}
        <a
          href={externalMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-9 items-center justify-center rounded border border-white/10 bg-white/[0.03] px-3 py-2 text-center text-[0.62rem] font-bold uppercase text-slate-200"
        >
          Abrir en Maps
        </a>
        {onViewDetail && (
          <button
            type="button"
            onClick={() => onViewDetail(poi)}
            className="min-h-9 rounded border border-white/10 bg-white/[0.03] px-3 py-2 text-[0.62rem] font-bold uppercase text-slate-200"
          >
            Ver detalle
          </button>
        )}
        {onReportUpdate && (
          <button
            type="button"
            onClick={() => onReportUpdate(poi)}
            className="min-h-9 rounded border border-white/10 bg-white/[0.03] px-3 py-2 text-[0.62rem] font-bold uppercase text-slate-200"
          >
            Reportar actualización
          </button>
        )}
        {onUseInModule && primaryModule && (
          <button
            type="button"
            onClick={() => onUseInModule(poi)}
            className="col-span-2 min-h-9 rounded border border-rose-300/25 bg-rose-400/8 px-3 py-2 text-[0.62rem] font-bold uppercase text-rose-100"
          >
            Usar en {primaryModule}
          </button>
        )}
      </div>
    </section>
  );
}
