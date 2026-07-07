"use client";

import { useEffect } from "react";
import type { GeoPoint, RouteResult } from "@/lib/routing/routingService";

/**
 * Dibuja el conjunto de rutas alternativas del sistema de navegacion general
 * (busqueda de destino + rutas por calles), resaltando la ruta seleccionada,
 * mas el marcador de usuario en vivo y el destino. Independiente de
 * `AuraMedicalRouteOverlay` (SOS Medico rapido), que sigue existiendo para no
 * romper ese flujo mas liviano.
 */

interface Props {
  routes: RouteResult[];
  selectedRouteId: string | null;
  currentPosition: GeoPoint | null;
  destination: GeoPoint | null;
  map: import("leaflet").Map | null;
  leaflet: typeof import("leaflet") | null;
}

const routeColorByLabel: Record<NonNullable<RouteResult["label"]>, string> = {
  fastest: "#22d3ee",
  shortest: "#a78bfa",
  safest: "#34d399",
  alternative: "#94a3b8",
};

export default function NavigationRouteOverlay({
  routes,
  selectedRouteId,
  currentPosition,
  destination,
  map,
  leaflet,
}: Props) {
  useEffect(() => {
    if (!map || !leaflet || routes.length === 0) return;

    const layer = leaflet.layerGroup().addTo(map);

    routes.forEach((route) => {
      const isSelected = route.id === selectedRouteId;
      const color = route.isDemo ? "#f472b6" : routeColorByLabel[route.label ?? "alternative"];
      const polyline = leaflet
        .polyline(route.geometry, {
          color,
          opacity: isSelected ? 0.95 : 0.35,
          weight: isSelected ? 6 : 3,
          dashArray: route.isDemo ? "8 10" : undefined,
          className: `argus-nav-route ${isSelected ? "argus-nav-route-selected" : ""}`,
        })
        .addTo(layer);

      polyline.bindTooltip(
        route.isDemo
          ? `${route.title ?? "Ruta"} · estimada (demo) · ${route.distanceKm.toFixed(1)} km`
          : `${route.title ?? "Ruta"} · ${route.distanceKm.toFixed(1)} km · ${route.durationMin} min`,
        { direction: "top", opacity: 0.92, sticky: true }
      );

      if (isSelected) polyline.bringToFront();
    });

    if (destination) {
      leaflet
        .marker([destination.lat, destination.lng], {
          icon: leaflet.divIcon({
            className: "argus-nav-destination-marker",
            html: `<div style="width:16px;height:16px;border-radius:50% 50% 50% 0;background:#22d3ee;border:2px solid white;transform:rotate(-45deg);box-shadow:0 0 8px rgba(34,211,238,0.6)"></div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 16],
          }),
        })
        .addTo(layer);
    }

    if (currentPosition) {
      leaflet
        .circleMarker([currentPosition.lat, currentPosition.lng], {
          radius: 8,
          color: "#22d3ee",
          fillColor: "#0891b2",
          fillOpacity: 0.9,
          weight: 2,
          className: "argus-nav-user-marker",
        })
        .addTo(layer);
    }

    const selectedRoute = routes.find((route) => route.id === selectedRouteId);
    const boundsSource = selectedRoute?.geometry ?? routes[0]?.geometry;
    if (typeof map.fitBounds === "function" && boundsSource && boundsSource.length > 1) {
      map.fitBounds(leaflet.latLngBounds(boundsSource), { padding: [72, 72], maxZoom: 16 });
    }

    return () => {
      map.removeLayer(layer);
    };
  }, [leaflet, map, routes, selectedRouteId, currentPosition, destination]);

  return null;
}
