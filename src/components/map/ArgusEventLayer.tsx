"use client";

import { useEffect } from "react";
import type { ArgusEvent, ArgusConfidence, ArgusEventType } from "@/types/argusEvent";
import {
  createArgusDivIcon,
  type ArgusMapConfidence,
  type ArgusMapEventKind,
} from "@/lib/mapSymbols/argusMapSymbols";
import { isVisibleAtZoom, type ArgusMapVisibilityCategory } from "@/lib/map/argusZoomVisibility";

export type ArgusEventLayerId =
  | "argusOfficialAlerts"
  | "argusSevereWeather"
  | "argusLandslideFlood"
  | "argusRoadDisruption"
  | "argusNewsEvidence";

interface Props {
  events: ArgusEvent[];
  visibility: Partial<Record<ArgusEventLayerId, boolean>>;
  selectedEventId?: string | null;
  onEventSelect?: (event: ArgusEvent) => void;
  /** Current map zoom — drives progressive disclosure, see `resolveVisibilityCategory`. */
  zoom: number;
  map: import("leaflet").Map | null;
  leaflet: typeof import("leaflet") | null;
}

/**
 * Polygons/region references (risk zones) and `OFFICIAL_ALERT` markers are
 * priority-1 ("alertas oficiales") — always visible. A specific incident
 * point (landslide, road closure, ...) or a news/OSINT marker is secondary
 * detail on top of that zone, gated to zoom >= 10 so it doesn't clutter a
 * far-away view — same ladder as the rest of the map, see
 * `@/lib/map/argusZoomVisibility`.
 */
function resolveVisibilityCategory(event: ArgusEvent): ArgusMapVisibilityCategory {
  if (event.geometry.type === "polygon" || event.geometry.type === "region_reference") {
    return "risk_zone";
  }
  if (event.eventType === "OFFICIAL_ALERT") return "critical_alert";
  if (event.eventType === "NEWS_REPORTED_INCIDENT" || event.eventType === "CITIZEN_REPORT") {
    return "news_evidence";
  }
  return "incident_point";
}

/**
 * Which of the 5 phenomenon-based toggles an `ArgusEvent` belongs to. This
 * is keyed by `eventType` (the hazard), never by `country` — ARGUS map
 * layers are one global model, not one layer per country.
 */
function resolveLayerId(eventType: ArgusEventType): ArgusEventLayerId {
  switch (eventType) {
    case "OFFICIAL_ALERT":
    case "RISK_ZONE":
      return "argusOfficialAlerts";
    case "SEVERE_WEATHER":
    case "HEAVY_RAIN":
      return "argusSevereWeather";
    case "FLOOD":
    case "LANDSLIDE":
      return "argusLandslideFlood";
    case "ROAD_CLOSURE":
      return "argusRoadDisruption";
    default:
      return "argusNewsEvidence";
  }
}

function resolveMarkerKind(eventType: ArgusEventType): ArgusMapEventKind {
  switch (eventType) {
    case "OFFICIAL_ALERT":
      return "official_source";
    case "SEVERE_WEATHER":
    case "HEAVY_RAIN":
    case "FLOOD":
      return "weather";
    case "EARTHQUAKE":
      return "earthquake";
    case "TSUNAMI":
      return "tsunami";
    case "WILDFIRE":
      return "fire";
    case "LANDSLIDE":
    case "ROAD_CLOSURE":
    case "RISK_ZONE":
      return "risk_assessment";
    default:
      return "risk_assessment";
  }
}

const markerLabel: Partial<Record<ArgusEventType, string>> = {
  OFFICIAL_ALERT: "OA",
  RISK_ZONE: "RZ",
  SEVERE_WEATHER: "SW",
  HEAVY_RAIN: "HR",
  FLOOD: "FL",
  LANDSLIDE: "LS",
  ROAD_CLOSURE: "RC",
  EARTHQUAKE: "EQ",
  TSUNAMI: "TS",
  WILDFIRE: "WF",
};

function resolveMapConfidence(confidence: ArgusConfidence): ArgusMapConfidence {
  switch (confidence) {
    case "low":
      return "raw";
    case "medium":
    case "medium_high":
      return "reported";
    case "high":
      return "verified";
    case "verified":
      return "official";
  }
}

/** Yellow = alerta/riesgo oficial, naranja = activo, rojo = confirmado grave. */
function resolveZoneColor(event: ArgusEvent): string {
  if (event.severity === "critical") return "#ef4444";
  if (event.status === "confirmed") return event.severity === "high" ? "#ef4444" : "#fb923c";
  if (event.status === "active") return event.severity === "high" ? "#f97316" : "#fb923c";
  if (event.status === "risk" || event.status === "monitoring") return "#facc15";
  return "#22d3ee";
}

function buildTooltip(event: ArgusEvent) {
  const confirmationNote = event.needsOfficialConfirmation ? " · pendiente confirmación oficial" : "";
  return `${event.title} · ${event.attribution} · confianza ${event.confidence}${confirmationNote}`;
}

export default function ArgusEventLayer({
  events,
  visibility,
  selectedEventId,
  onEventSelect,
  zoom,
  map,
  leaflet,
}: Props) {
  useEffect(() => {
    if (!map || !leaflet) return;

    const layer = leaflet.layerGroup().addTo(map);

    events.forEach((event) => {
      const layerId = resolveLayerId(event.eventType);
      if (!visibility[layerId]) return;
      if (!isVisibleAtZoom(resolveVisibilityCategory(event), zoom)) return;

      const color = resolveZoneColor(event);
      const isSelected = event.id === selectedEventId;
      let mapLayer: import("leaflet").Layer | null = null;

      if (event.geometry.type === "polygon") {
        mapLayer = leaflet
          .polygon(event.geometry.coordinates, {
            color,
            weight: isSelected ? 3 : 1.5,
            fillColor: color,
            fillOpacity: 0.14,
          })
          .addTo(layer);
      } else if (event.geometry.type === "region_reference" && event.geometry.polygonEstimate) {
        mapLayer = leaflet
          .polygon(event.geometry.polygonEstimate, {
            color,
            weight: isSelected ? 3 : 1.5,
            fillColor: color,
            fillOpacity: 0.14,
            dashArray: "6 6",
          })
          .addTo(layer);
      } else if (event.geometry.type === "route") {
        mapLayer = leaflet
          .polyline(event.geometry.coordinates, {
            color,
            weight: isSelected ? 5 : 3,
            opacity: 0.9,
          })
          .addTo(layer);
      } else {
        const point: [number, number] =
          event.geometry.type === "point"
            ? event.geometry.coordinates
            : event.geometry.anchor;
        const icon = leaflet.divIcon(
          createArgusDivIcon({
            kind: resolveMarkerKind(event.eventType),
            severity: event.severity,
            confidence: resolveMapConfidence(event.confidence),
            label: markerLabel[event.eventType],
            title: event.title,
            active: event.status === "active" || event.status === "confirmed",
            selected: isSelected,
          })
        );
        mapLayer = leaflet.marker(point, { icon, title: event.title }).addTo(layer);
      }

      if (!mapLayer) return;
      mapLayer.bindTooltip(buildTooltip(event), { direction: "top", opacity: 0.92, sticky: true });
      mapLayer.on("click", () => onEventSelect?.(event));
    });

    return () => {
      map.removeLayer(layer);
    };
  }, [events, visibility, selectedEventId, onEventSelect, zoom, map, leaflet]);

  return null;
}
