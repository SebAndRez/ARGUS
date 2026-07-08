import type { CriticalPoi, CriticalPriority } from "@/lib/criticalPoi/criticalPoiTypes";

/**
 * Iconos de infraestructura critica. Deliberadamente distintos de
 * `PoiMarker.tsx` (P4 generico, pines chicos y planos) y de los simbolos
 * ARGUS de incidentes (`argusMapSymbols.ts`, con glow/pulso): P0/P1 usan una
 * insignia con forma propia (escudo) para que nunca se confundan con un pin
 * de comercio ni con un marcador de incidente, y para que el cluster
 * especial (`createCriticalClusterDivIcon`) sea visualmente distinto del
 * cluster numerico generico de comercios.
 */

export interface CriticalPoiDivIconDefinition {
  html: string;
  className: string;
  iconSize: [number, number];
  iconAnchor: [number, number];
}

const categoryGlyph: Record<CriticalPoi["category"], string> = {
  metro_station: "🚇",
  train_station: "🚆",
  bus_terminal: "🚌",
  hospital: "🏥",
  clinic: "➕",
  pharmacy: "💊",
  emergency_care: "🚑",
  police_station: "👮",
  prison: "⛓️",
  fire_station: "🚒",
  government_building: "🏛️",
  municipal_office: "🏢",
  public_office: "🏢",
  courthouse: "⚖️",
  prosecutor_office: "⚖️",
  justice_system: "⚖️",
  tax_office: "💰",
  treasury_office: "💰",
  customs_office: "🛃",
  civil_registry: "📋",
  shelter: "🏠",
  school: "🏫",
  stadium: "🏟️",
  logistics_center: "📦",
  supply_center: "📦",
};

const priorityColor: Record<CriticalPriority, string> = {
  P0: "#7f1d1d",
  P1: "#dc2626",
  P2: "#f59e0b",
  P3: "#0ea5e9",
  P4: "#94a3b8",
};

const priorityShape: Record<CriticalPriority, string> = {
  // P0/P1: insignia de "escudo" (hexagono achatado) para diferenciarse de un pin de comercio.
  P0: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
  P1: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
  P2: "circle(50% at 50% 50%)",
  P3: "circle(50% at 50% 50%)",
  P4: "circle(50% at 50% 50%)",
};

const prioritySize: Record<CriticalPriority, number> = {
  P0: 34,
  P1: 32,
  P2: 26,
  P3: 22,
  P4: 20,
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function createCriticalPoiDivIcon(poi: CriticalPoi, options: { selected?: boolean } = {}): CriticalPoiDivIconDefinition {
  const size = prioritySize[poi.priority] + (options.selected ? 6 : 0);
  const color = priorityColor[poi.priority];
  const glyph = categoryGlyph[poi.category] ?? "📍";
  const title = escapeHtml(`${poi.name} · ${poi.priority}`);
  const ring = options.selected
    ? "box-shadow:0 0 0 2px rgba(255,255,255,0.95),0 0 0 4px rgba(8,47,73,0.9),0 0 14px rgba(220,38,38,0.6);"
    : "box-shadow:0 1px 5px rgba(0,0,0,0.55);";

  const html = `
    <div class="argus-critical-poi-marker argus-critical-poi-${poi.priority.toLowerCase()}" title="${title}" aria-label="${title}" role="img" style="width:${size}px;height:${size}px;background:${color};${ring}clip-path:${priorityShape[poi.priority]};border:1.5px solid rgba(255,255,255,0.9);display:flex;align-items:center;justify-content:center;font-size:${Math.round(size * 0.5)}px;line-height:1;">
      ${glyph}
    </div>
  `;

  return {
    html,
    className: "argus-critical-poi-leaflet-icon leaflet-div-icon bg-transparent p-0 border-0",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  };
}

/** Cluster especial de infraestructura critica: insignia de escudo con conteo, no el circulo gris generico de PoiMarker. `hasP0P1` decide el color (rojo si agrupa P0/P1, ambar si es solo P2/P3). */
export function createCriticalClusterDivIcon(count: number, hasP0P1: boolean): CriticalPoiDivIconDefinition {
  const size = count >= 25 ? 44 : count >= 10 ? 38 : 32;
  const color = hasP0P1 ? "#991b1b" : "#b45309";
  const html = `
    <div class="argus-critical-cluster-marker" style="width:${size}px;height:${size}px;background:${color};clip-path:polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);border:2px solid rgba(255,255,255,0.92);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:${size >= 38 ? 14 : 12}px;box-shadow:0 1px 8px rgba(0,0,0,0.6);">
      ${count}
    </div>
  `;

  return {
    html,
    className: "argus-critical-cluster-leaflet-icon leaflet-div-icon bg-transparent p-0 border-0",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  };
}

/** Icono de agregado a nivel ciudad (zoom bajo, solo P0/P1). Distinto del cluster local: es un marcador de "hub critico", no algo que se abre al hacer click sino que invita a hacer zoom. */
export function createCriticalCityAggregateDivIcon(count: number): CriticalPoiDivIconDefinition {
  const size = 40;
  const html = `
    <div class="argus-critical-city-aggregate-marker" style="width:${size}px;height:${size}px;background:#7f1d1d;border-radius:999px;border:2px solid rgba(255,255,255,0.92);display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:12px;line-height:1;box-shadow:0 1px 8px rgba(0,0,0,0.6);">
      <span>⛨</span>
      <span style="font-size:10px;">${count}</span>
    </div>
  `;

  return {
    html,
    className: "argus-critical-city-aggregate-leaflet-icon leaflet-div-icon bg-transparent p-0 border-0",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  };
}
