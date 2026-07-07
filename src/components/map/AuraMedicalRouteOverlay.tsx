"use client";

import { useEffect } from "react";
import type { AuraMedicalRoute } from "@/lib/medical/auraMedicalRouting";

interface Props {
  route: AuraMedicalRoute | null;
  map: import("leaflet").Map | null;
  leaflet: typeof import("leaflet") | null;
}

/**
 * Dibuja la ruta medica AURA seleccionada (directa o segura) como una capa
 * independiente, sin tocar los marcadores/capas existentes del mapa
 * operacional. Siempre se marca como "ruta estimada" — no hay motor de
 * navegacion real conectado todavia.
 */
export default function AuraMedicalRouteOverlay({ route, map, leaflet }: Props) {
  useEffect(() => {
    if (!map || !leaflet || !route) return;

    const layer = leaflet.layerGroup().addTo(map);
    const color = route.kind === "safe" ? "#34d399" : "#f472b6";

    const polyline = leaflet
      .polyline(route.coordinates, {
        color,
        dashArray: "8 10",
        opacity: 0.9,
        weight: 4,
        className: "argus-aura-medical-route",
      })
      .addTo(layer);

    polyline.bindTooltip(
      `Ruta ${route.kind === "safe" ? "mas segura" : "mas directa"} (estimada) · ${route.distanceKm.toFixed(1)} km`,
      { direction: "top", opacity: 0.92, sticky: true }
    );

    if (typeof map.fitBounds === "function" && route.coordinates.length > 1) {
      map.fitBounds(leaflet.latLngBounds(route.coordinates), { padding: [64, 64], maxZoom: 15 });
    }

    return () => {
      map.removeLayer(layer);
    };
  }, [leaflet, map, route]);

  return null;
}
