import type { PoiCategory, PoiEntity } from "@/lib/pois/poiTypes";

/**
 * Constructores de icono para la capa de POIs urbanos. Como el resto de
 * marcadores del mapa (ver `argusMapSymbols.ts`), Leaflet no monta arboles de
 * React por marcador — se genera HTML y se envuelve en `L.divIcon`. Los
 * iconos son deliberadamente pequeños/planos (estilo pin de Google Maps), a
 * diferencia de los simbolos ARGUS con glow/pulso para incidentes: un POI
 * urbano nunca debe competir visualmente con una alerta critica.
 */

export interface PoiDivIconDefinition {
  html: string;
  className: string;
  iconSize: [number, number];
  iconAnchor: [number, number];
}

const categoryGlyph: Record<PoiCategory, string> = {
  shop: "🛒",
  restaurant: "🍽️",
  pharmacy: "💊",
  hospital: "🏥",
  clinic: "➕",
  school: "🏫",
  transport: "🚉",
  metro: "🚇",
  bus_stop: "🚌",
  fuel: "⛽",
  bank: "🏦",
  atm: "🏧",
  police: "👮",
  fire_station: "🚒",
  park: "🌳",
  parking: "🅿️",
  service: "🔧",
  other: "📍",
};

const categoryColor: Record<PoiCategory, string> = {
  shop: "#a855f7",
  restaurant: "#f97316",
  pharmacy: "#22c55e",
  hospital: "#ef4444",
  clinic: "#ef4444",
  school: "#3b82f6",
  transport: "#0ea5e9",
  metro: "#0ea5e9",
  bus_stop: "#14b8a6",
  fuel: "#eab308",
  bank: "#64748b",
  atm: "#64748b",
  police: "#2563eb",
  fire_station: "#dc2626",
  park: "#22c55e",
  parking: "#94a3b8",
  service: "#78716c",
  other: "#94a3b8",
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function createPoiDivIcon(poi: PoiEntity, options: { selected?: boolean } = {}): PoiDivIconDefinition {
  const size = options.selected ? 30 : 24;
  const color = categoryColor[poi.category] ?? categoryColor.other;
  const glyph = categoryGlyph[poi.category] ?? categoryGlyph.other;
  const title = escapeHtml(poi.name);
  const ring = options.selected
    ? "box-shadow:0 0 0 2px rgba(255,255,255,0.95),0 0 0 4px rgba(8,47,73,0.85);"
    : "box-shadow:0 1px 4px rgba(0,0,0,0.45);";

  const html = `
    <div class="argus-poi-marker" title="${title}" aria-label="${title}" role="img" style="width:${size}px;height:${size}px;background:${color};${ring}border-radius:999px;border:1.5px solid rgba(255,255,255,0.85);display:flex;align-items:center;justify-content:center;font-size:${Math.round(size * 0.55)}px;line-height:1;">
      ${glyph}
    </div>
  `;

  return {
    html,
    className: "argus-poi-leaflet-icon leaflet-div-icon bg-transparent p-0 border-0",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  };
}

export function createPoiClusterDivIcon(count: number): PoiDivIconDefinition {
  const size = count >= 25 ? 40 : count >= 10 ? 36 : 30;
  const html = `
    <div class="argus-poi-cluster-marker" style="width:${size}px;height:${size}px;background:rgba(15,23,42,0.92);border:2px solid rgba(148,163,184,0.85);border-radius:999px;display:flex;align-items:center;justify-content:center;color:#e2e8f0;font-weight:700;font-size:${size >= 36 ? 13 : 11}px;box-shadow:0 1px 6px rgba(0,0,0,0.5);">
      ${count}
    </div>
  `;

  return {
    html,
    className: "argus-poi-cluster-leaflet-icon leaflet-div-icon bg-transparent p-0 border-0",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  };
}
