"use client";

import { useEffect } from "react";
import type { ArgusRoute, RouteType } from "@/types/map";

interface Props {
  routes: ArgusRoute[];
  visibleTypes: Partial<Record<RouteType, boolean>>;
  map: import("leaflet").Map | null;
  leaflet: typeof import("leaflet") | null;
}

const routePresentation: Record<
  RouteType,
  { color: string; dashArray?: string; label: string }
> = {
  terrestrial: {
    color: "#34d399",
    label: "Ruta terrestre",
  },
  air: {
    color: "#a78bfa",
    dashArray: "7 8",
    label: "Ruta aérea",
  },
  maritime: {
    color: "#22d3ee",
    dashArray: "12 7",
    label: "Ruta marítima",
  },
};

function createTooltip(route: ArgusRoute) {
  const wrapper = document.createElement("div");
  wrapper.className = "grid max-w-64 gap-1";

  const eyebrow = document.createElement("p");
  eyebrow.className = "text-[0.62rem] font-bold uppercase tracking-[0.14em] text-cyan-300";
  eyebrow.textContent = routePresentation[route.type].label;

  const title = document.createElement("p");
  title.className = "text-sm font-semibold text-white";
  title.textContent = route.title;

  const detail = document.createElement("p");
  detail.className = "text-xs leading-5 text-slate-300";
  detail.textContent = [
    route.status,
    typeof route.confidence === "number" ? `confianza ${route.confidence}%` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  wrapper.append(eyebrow, title);
  if (detail.textContent) wrapper.append(detail);
  return wrapper;
}

export default function RouteLayerOverlay({
  routes,
  visibleTypes,
  map,
  leaflet,
}: Props) {
  useEffect(() => {
    if (!map || !leaflet) return;

    const layer = leaflet.layerGroup().addTo(map);

    routes
      .filter((route) => visibleTypes[route.type])
      .forEach((route) => {
        const presentation = routePresentation[route.type];
        const polyline = leaflet
          .polyline(route.coordinates, {
            color: presentation.color,
            dashArray: presentation.dashArray,
            opacity: 0.9,
            weight: route.type === "terrestrial" ? 5 : 4,
            className: `argus-route argus-route-${route.type}`,
          })
          .addTo(layer);

        polyline.bindTooltip(createTooltip(route), {
          className: "argus-route-tooltip",
          direction: "top",
          opacity: 1,
          sticky: true,
        });
      });

    return () => {
      map.removeLayer(layer);
    };
  }, [leaflet, map, routes, visibleTypes]);

  return null;
}
