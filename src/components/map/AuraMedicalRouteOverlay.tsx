"use client";

import { useEffect } from "react";
import type { RouteResult } from "@/lib/routing/routingService";

interface Props {
  route: RouteResult | null;
  map: import("leaflet").Map | null;
  leaflet: typeof import("leaflet") | null;
}

/**
 * Dibuja la ruta real por calles del SOS Medico rapido (geometria de
 * `routingService`) como una capa independiente, sin tocar los
 * marcadores/capas existentes del mapa operacional. Si el routing real fallo
 * y se esta mostrando el fallback de linea recta (`route.isDemo`), se marca
 * visualmente distinto (linea punteada) para no confundirla con navegacion
 * real.
 */
export default function AuraMedicalRouteOverlay({ route, map, leaflet }: Props) {
  useEffect(() => {
    if (!map || !leaflet || !route) return;

    const layer = leaflet.layerGroup().addTo(map);
    const color = route.isDemo ? "#f472b6" : "#22d3ee";

    const polyline = leaflet
      .polyline(route.geometry, {
        color,
        dashArray: route.isDemo ? "8 10" : undefined,
        opacity: 0.92,
        weight: route.isDemo ? 4 : 5,
        className: "argus-aura-medical-route",
      })
      .addTo(layer);

    polyline.bindTooltip(
      route.isDemo
        ? `Ruta estimada (demo) · ${route.distanceKm.toFixed(1)} km`
        : `Ruta por calles · ${route.distanceKm.toFixed(1)} km · ${route.durationMin} min`,
      { direction: "top", opacity: 0.92, sticky: true }
    );

    if (typeof map.fitBounds === "function" && route.geometry.length > 1) {
      map.fitBounds(leaflet.latLngBounds(route.geometry), { padding: [64, 64], maxZoom: 16 });
    }

    return () => {
      map.removeLayer(layer);
    };
  }, [leaflet, map, route]);

  return null;
}
