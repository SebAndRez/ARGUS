"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { demoFenixRoutes, demoFenixShelters } from "@/data/fenixDemo";
import type { FenixSimulationResult } from "@/types/fenixSimulation";

export default function FenixSimulationMap({ result }: { result: FenixSimulationResult }) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const overlayRef = useRef<import("leaflet").FeatureGroup | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  const center = useMemo<[number, number]>(() => {
    const fallback = result.input.initialLocation;
    const candidate = result.mapCenter ?? [fallback.latitude, fallback.longitude];
    return [
      Number.isFinite(candidate[0]) ? candidate[0] : fallback.latitude,
      Number.isFinite(candidate[1]) ? candidate[1] : fallback.longitude,
    ];
  }, [result.input.initialLocation, result.mapCenter]);

  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      if (!mapContainerRef.current || mapRef.current) return;
      try {
        const L = (await import("leaflet")) as typeof import("leaflet");
        if (cancelled || !mapContainerRef.current) return;

        const map = L.map(mapContainerRef.current, {
          zoomControl: true,
          attributionControl: true,
          preferCanvas: true,
        }).setView(center, 11);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "&copy; OpenStreetMap contributors",
        }).addTo(map);

        mapRef.current = map;
        setTimeout(() => map.invalidateSize(), 120);
      } catch {
        if (!cancelled) {
          setMapError("El mapa Fenix no pudo iniciarse en este navegador.");
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

    async function drawOverlays() {
      const map = mapRef.current;
      if (!map) return;
      const L = (await import("leaflet")) as typeof import("leaflet");
      if (cancelled) return;

      if (overlayRef.current) {
        overlayRef.current.remove();
      }

      const layer = L.featureGroup().addTo(map);
      overlayRef.current = layer;

      map.setView(center, 11, { animate: true });

      result.affectedZones.forEach((zone, index) => {
        L.circle(zone.center, {
          radius: Math.max(250, zone.radiusKm * 1000),
          color: index === 0 ? "#22d3ee" : zone.exposureLevel === "critical" ? "#ef4444" : "#f97316",
          fillColor: index === 0 ? "#22d3ee" : zone.exposureLevel === "critical" ? "#ef4444" : "#f97316",
          fillOpacity: index === 0 ? 0.08 : 0.11,
          opacity: 0.72,
          weight: 2,
          className: "argus-fenix-zone",
        })
          .bindTooltip(`${zone.timeLabel} - ${zone.radiusKm} km - zona estimada`)
          .addTo(layer);
      });

      L.circleMarker(center, {
        radius: 7,
        color: "#67e8f9",
        fillColor: "#22d3ee",
        fillOpacity: 0.95,
        weight: 2,
      })
        .bindTooltip("Coordenada inicial analizada")
        .addTo(layer);

      const routes = demoFenixRoutes.filter(
        (route) => route.scenarioId === result.input.scenarioId
      );
      routes.forEach((route) => {
        L.polyline(route.coordinates, {
          color: route.status === "blocked" ? "#ef4444" : route.status === "critical" ? "#f59e0b" : "#38bdf8",
          weight: route.status === "blocked" ? 4 : 3,
          dashArray: route.status === "blocked" ? "4 8" : route.status === "critical" ? "8 6" : undefined,
          opacity: 0.86,
        })
          .bindTooltip(`${route.name} - ${route.status}`)
          .addTo(layer);
      });

      demoFenixShelters
        .filter((shelter) => shelter.scenarioId === result.input.scenarioId)
        .forEach((shelter) => {
          L.circleMarker(shelter.coordinates, {
            radius: 6,
            color: "#a7f3d0",
            fillColor: shelter.status === "near_capacity" ? "#f59e0b" : "#10b981",
            fillOpacity: 0.92,
            weight: 2,
          })
            .bindTooltip(`${shelter.name} - ${shelter.status}`)
            .addTo(layer);
        });

      const bounds = layer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.18), { maxZoom: 12, animate: true });
      }
      setTimeout(() => map.invalidateSize(), 80);
    }

    drawOverlays();
    return () => {
      cancelled = true;
    };
  }, [center, result]);

  useEffect(() => {
    return () => {
      overlayRef.current?.remove();
      mapRef.current?.remove();
      overlayRef.current = null;
      mapRef.current = null;
    };
  }, []);

  return (
    <section className="rounded-lg border border-cyan-300/15 bg-slate-950/85 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-300">Mapa Fenix</p>
          <h3 className="mt-1 text-lg font-semibold text-white">Coordenadas y zona estimada</h3>
        </div>
        <span className="rounded border border-amber-300/20 bg-amber-400/10 px-2 py-1 text-[0.58rem] font-bold uppercase text-amber-100">
          DEMO / No oficial
        </span>
      </div>
      <div className="mt-4 overflow-hidden rounded border border-white/10 bg-slate-900">
        {mapError ? (
          <div className="grid h-80 place-items-center p-5 text-center text-sm text-amber-100">
            <div>
              <p className="font-semibold">{mapError}</p>
              <p className="mt-2 text-slate-400">
                Coordenada: {center[0].toFixed(4)}, {center[1].toFixed(4)}
              </p>
            </div>
          </div>
        ) : (
          <div ref={mapContainerRef} className="argus-leaflet-map h-80 w-full" />
        )}
      </div>
      <div className="mt-3 grid gap-2 text-xs leading-5 text-slate-400 sm:grid-cols-3">
        <p>
          Centro: <span className="text-slate-200">{center[0].toFixed(4)}, {center[1].toFixed(4)}</span>
        </p>
        <p>
          Radio inicial: <span className="text-slate-200">{result.initialRadiusKm ?? result.input.initialRadiusKm} km</span>
        </p>
        <p>
          Capas: <span className="text-slate-200">zonas, rutas demo, refugios demo</span>
        </p>
      </div>
      <p className="mt-2 text-xs leading-5 text-amber-100">
        Zona estimada, no exacta. No representa un poligono oficial ni instruccion de evacuacion.
      </p>
    </section>
  );
}
