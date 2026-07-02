"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FenixPredictionFrame } from "@/types/fenixSimulation";

type Props = {
  frame: FenixPredictionFrame;
};

function formatCoordinate(value: number) {
  return Number.isFinite(value) ? value.toFixed(4) : "--";
}

export default function FenixPredictionFrameCard({ frame }: Props) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const overlayRef = useRef<import("leaflet").FeatureGroup | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  const origin = useMemo<[number, number]>(() => frame.origin, [frame.origin]);
  const center = useMemo<[number, number]>(() => frame.center, [frame.center]);

  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      if (!mapContainerRef.current || mapRef.current) return;
      try {
        const L = (await import("leaflet")) as typeof import("leaflet");
        if (cancelled || !mapContainerRef.current) return;

        const map = L.map(mapContainerRef.current, {
          zoomControl: false,
          attributionControl: true,
          dragging: true,
          scrollWheelZoom: false,
          doubleClickZoom: false,
          boxZoom: false,
          keyboard: false,
          preferCanvas: true,
        }).setView(center, 11);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "&copy; OpenStreetMap",
        }).addTo(map);

        mapRef.current = map;
        setTimeout(() => map.invalidateSize(), 120);
      } catch {
        if (!cancelled) {
          setMapError("No se pudo iniciar el mapa de esta fase.");
        }
      }
    }

    initMap();
    return () => {
      cancelled = true;
    };
  }, [center]);

  useEffect(() => {
    let cancelled = false;

    async function drawFrame() {
      const map = mapRef.current;
      if (!map) return;
      const L = (await import("leaflet")) as typeof import("leaflet");
      if (cancelled) return;

      overlayRef.current?.remove();
      const layer = L.featureGroup().addTo(map);
      overlayRef.current = layer;

      const severityColor =
        frame.severity === "critical"
          ? "#ef4444"
          : frame.severity === "high"
            ? "#f97316"
            : frame.severity === "medium"
              ? "#f59e0b"
              : "#22d3ee";

      L.circle(center, {
        radius: Math.max(250, frame.radiusKm * 1000),
        color: severityColor,
        fillColor: severityColor,
        fillOpacity: 0.13,
        opacity: 0.82,
        weight: 2,
      })
        .bindTooltip(`${frame.title} - ${frame.radiusKm} km`)
        .addTo(layer);

      L.circleMarker(origin, {
        radius: 6,
        color: "#67e8f9",
        fillColor: "#22d3ee",
        fillOpacity: 0.95,
        weight: 2,
      })
        .bindTooltip("Punto de origen ingresado")
        .addTo(layer);

      L.circleMarker(center, {
        radius: 5,
        color: "#fef08a",
        fillColor: "#facc15",
        fillOpacity: 0.95,
        weight: 2,
      })
        .bindTooltip("Centro proyectado de esta fase")
        .addTo(layer);

      L.polyline([origin, center], {
        color: "#facc15",
        weight: 2,
        opacity: 0.82,
        dashArray: "6 6",
      })
        .bindTooltip(`Direccion ${frame.direction}`)
        .addTo(layer);

      const bounds = layer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.35), { maxZoom: 12, animate: false });
      } else {
        map.setView(center, 11, { animate: false });
      }
      setTimeout(() => map.invalidateSize(), 80);
    }

    drawFrame();
    return () => {
      cancelled = true;
    };
  }, [center, frame, origin]);

  useEffect(() => {
    return () => {
      overlayRef.current?.remove();
      mapRef.current?.remove();
      overlayRef.current = null;
      mapRef.current = null;
    };
  }, []);

  return (
    <article className="overflow-hidden rounded-lg border border-cyan-300/15 bg-slate-950/80 shadow-2xl shadow-black/20">
      <div className="border-b border-white/10 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[0.62rem] font-bold uppercase tracking-[0.18em] text-cyan-300">
              {frame.label}
            </p>
            <h4 className="mt-1 text-lg font-semibold text-white">{frame.title}</h4>
          </div>
          <span className="rounded border border-amber-300/20 bg-amber-400/10 px-2 py-1 text-[0.58rem] font-bold uppercase text-amber-100">
            Estimacion ARGUS
          </span>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-300">{frame.summary}</p>
      </div>

      <div className="relative h-64 border-b border-white/10 bg-slate-900 sm:h-72">
        {mapError ? (
          <div className="grid h-full place-items-center p-4 text-center text-sm text-amber-100">
            <div>
              <p className="font-semibold">{mapError}</p>
              <p className="mt-2 text-slate-400">
                Centro: {formatCoordinate(center[0])}, {formatCoordinate(center[1])}
              </p>
            </div>
          </div>
        ) : (
          <div ref={mapContainerRef} className="argus-leaflet-map h-full w-full" />
        )}
        <div className="pointer-events-none absolute left-3 top-3 rounded border border-slate-700/70 bg-slate-950/85 px-2 py-1 text-[0.58rem] font-bold uppercase tracking-[0.12em] text-slate-200 backdrop-blur">
          {frame.timeLabel}
        </div>
      </div>

      <div className="grid gap-3 p-4 text-xs leading-5 text-slate-400 sm:grid-cols-2">
        <Metric label="Centro analizado" value={`${formatCoordinate(origin[0])}, ${formatCoordinate(origin[1])}`} />
        <Metric label="Centro proyectado" value={`${formatCoordinate(center[0])}, ${formatCoordinate(center[1])}`} />
        <Metric label="Tiempo estimado" value={frame.timeLabel} />
        <Metric label="Radio estimado" value={`${frame.radiusKm} km`} />
        <Metric label="Direccion" value={frame.direction} />
        <Metric label="Confianza" value={`${frame.confidence}%`} />
        <Metric label="Incertidumbre" value={frame.uncertainty} />
        <Metric label="Rutas afectadas" value={String(frame.routeImpacts)} />
      </div>

      <div className="border-t border-amber-300/15 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100">
        Estimacion ARGUS. No reemplaza informacion oficial ni instruccion de evacuacion.
        La expansion simulada puede cambiar con nueva evidencia.
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[0.58rem] font-bold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 break-words font-semibold text-slate-100">{value}</p>
    </div>
  );
}
