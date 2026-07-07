"use client";

import type { GeoPoint } from "@/lib/routing/routingService";
import type { PoiEntity } from "@/lib/pois/poiTypes";
import { poiCategoryLabels } from "@/lib/pois/poiTypes";
import { buildExternalMapsUrl } from "@/lib/navigation/navigationService";

/**
 * Ficha simple estilo Google Maps para un POI urbano: nombre, categoria,
 * distancia, direccion/descripcion y acciones (Ruta / Abrir en Maps /
 * Guardar-reportar). Deliberadamente mas liviana que `MapEntityCard` (que
 * cubre hospitales/refugios/incidentes con multiples flujos por modulo) —
 * un POI generico no tiene "Abrir AURA" ni "Ver capacidad".
 */

interface Props {
  poi: PoiEntity;
  userLocation?: GeoPoint;
  onClose: () => void;
  onRoute?: (poi: PoiEntity) => void;
  onSaveOrReport?: (poi: PoiEntity) => void;
}

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

export default function PoiInfoCard({ poi, userLocation, onClose, onRoute, onSaveOrReport }: Props) {
  const distanceKm = userLocation ? haversineKm(userLocation, { lat: poi.lat, lng: poi.lng }) : undefined;
  const externalMapsUrl = userLocation
    ? buildExternalMapsUrl(userLocation, { lat: poi.lat, lng: poi.lng }, "walking")
    : `https://www.google.com/maps/search/?api=1&query=${poi.lat},${poi.lng}`;

  return (
    <section className="argus-poi-info-card pointer-events-auto fixed inset-x-0 bottom-4 z-[64] mx-auto grid w-[340px] max-w-[calc(100%-2rem)] gap-2 rounded-lg border border-cyan-300/20 bg-slate-950/96 p-3 text-xs shadow-2xl shadow-black/50 backdrop-blur-xl">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.58rem] font-bold uppercase tracking-[0.16em] text-cyan-300">
            {poiCategoryLabels[poi.category]}
            {distanceKm !== undefined ? ` · ${formatDistance(distanceKm)}` : ""}
          </p>
          <h3 className="truncate text-sm font-semibold text-white">{poi.name || poiCategoryLabels[poi.category]}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded border border-white/10 bg-white/[0.03] px-2 py-1 text-[0.58rem] font-bold uppercase text-slate-300"
        >
          Cerrar
        </button>
      </header>

      {(poi.address || poi.description) && (
        <p className="text-slate-400">{[poi.address, poi.description].filter(Boolean).join(" · ")}</p>
      )}

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
        {onSaveOrReport && (
          <button
            type="button"
            onClick={() => onSaveOrReport(poi)}
            className="col-span-2 min-h-9 rounded border border-white/10 bg-white/[0.03] px-3 py-2 text-[0.62rem] font-bold uppercase text-slate-300"
          >
            Guardar / reportar actualización
          </button>
        )}
      </div>
    </section>
  );
}
