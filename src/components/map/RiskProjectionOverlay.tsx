"use client";

import { useEffect } from "react";
import { buildRiskConePolygon } from "@/lib/riskProjection";
import type { RiskProjection } from "@/types/weatherRisk";

interface Props {
  projections: RiskProjection[];
  visible: boolean;
  onProjectionSelect?: (projection: RiskProjection) => void;
  map: import("leaflet").Map | null;
  leaflet: typeof import("leaflet") | null;
}

const projectionPresentation: Record<
  RiskProjection["kind"],
  { color: string; fillColor: string; label: string }
> = {
  fire_smoke: {
    color: "#fb7185",
    fillColor: "#f97316",
    label: "Humo / incendio",
  },
  wildfire: {
    color: "#ef4444",
    fillColor: "#f97316",
    label: "Incendio forestal",
  },
  chemical_plume: {
    color: "#facc15",
    fillColor: "#d97706",
    label: "Posible liberación química",
  },
  gas_leak: {
    color: "#fbbf24",
    fillColor: "#ca8a04",
    label: "Posible fuga de gas",
  },
  unknown_hazard: {
    color: "#cbd5e1",
    fillColor: "#f59e0b",
    label: "Riesgo por confirmar",
  },
};

function createTooltipContent(projection: RiskProjection) {
  const wrapper = document.createElement("div");
  wrapper.className = "grid max-w-64 gap-1";

  const eyebrow = document.createElement("p");
  eyebrow.className = "text-[0.62rem] font-bold uppercase tracking-[0.14em] text-amber-300";
  eyebrow.textContent = "Zona estimada de riesgo";

  const title = document.createElement("p");
  title.className = "text-sm font-semibold text-white";
  title.textContent = projection.title;

  const detail = document.createElement("p");
  detail.className = "text-xs leading-5 text-slate-300";
  detail.textContent = `${projectionPresentation[projection.kind].label} · confianza ${projection.confidence}% · viento hacia ${projection.windToLabel}`;

  const action = document.createElement("p");
  action.className = "border-t border-white/10 pt-1 text-xs leading-5 text-slate-200";
  action.textContent = projection.recommendedAction;

  wrapper.append(eyebrow, title, detail, action);
  return wrapper;
}

export default function RiskProjectionOverlay({
  projections,
  visible,
  onProjectionSelect,
  map,
  leaflet,
}: Props) {
  useEffect(() => {
    if (!map || !leaflet || !visible) return;

    const layer = leaflet.layerGroup().addTo(map);

    projections.forEach((projection) => {
      const presentation = projectionPresentation[projection.kind];
      const conePoints = buildRiskConePolygon(projection);
      const directionPoints = buildRiskConePolygon(projection, 4);
      const polygon = leaflet
        .polygon(conePoints, {
          color: presentation.color,
          fillColor: presentation.fillColor,
          fillOpacity: 0.2,
          opacity: 0.85,
          weight: 2,
          dashArray: "8 7",
          className: "argus-risk-projection",
        })
        .addTo(layer);

      const directionLine = leaflet
        .polyline(
          [
            [projection.originLatitude, projection.originLongitude],
            directionPoints[3],
          ],
          {
            color: presentation.color,
            opacity: 0.8,
            weight: 2,
            dashArray: "3 6",
          }
        )
        .addTo(layer);

      const origin = leaflet
        .circleMarker([projection.originLatitude, projection.originLongitude], {
          radius: 8,
          color: "#f8fafc",
          fillColor: presentation.fillColor,
          fillOpacity: 0.95,
          opacity: 0.9,
          weight: 2,
        })
        .addTo(layer);

      const tooltipContent = createTooltipContent(projection);
      polygon.bindTooltip(tooltipContent, {
        className: "argus-risk-tooltip",
        direction: "top",
        opacity: 1,
        sticky: true,
      });
      origin.bindTooltip(createTooltipContent(projection), {
        className: "argus-risk-tooltip",
        direction: "top",
        opacity: 1,
      });

      polygon.on("click", () => onProjectionSelect?.(projection));
      directionLine.on("click", () => onProjectionSelect?.(projection));
      origin.on("click", () => onProjectionSelect?.(projection));
    });

    return () => {
      map.removeLayer(layer);
    };
  }, [leaflet, map, onProjectionSelect, projections, visible]);

  return null;
}
