"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CrisisEvent } from "@/types/crisis";
import type { UserLocationStatus } from "@/types/crisis";
import IncidentMarker from "@/components/map/IncidentMarker";
import UserLocationMarker from "@/components/map/UserLocationMarker";

interface MapLayerSettings {
  reports: boolean;
  sos: boolean;
  alerts: boolean;
  critical: boolean;
  resolved: boolean;
  user: boolean;
}

interface Props {
  events: CrisisEvent[];
  selectedEventId?: string;
  location: {
    latitude: number;
    longitude: number;
  };
  locationStatus: UserLocationStatus;
  layerSettings: MapLayerSettings;
  onEventSelect?: (event: CrisisEvent) => void;
  centerOnSelected?: boolean;
}

const DEFAULT_CENTER: [number, number] = [-33.4489, -70.6693];

const isEventVisible = (event: CrisisEvent, layers: MapLayerSettings) => {
  if (event.status === "RESOLVED" && !layers.resolved) return false;
  if (event.severity === "CRITICAL" && !layers.critical) return false;
  if (event.type === "SOS" && !layers.sos) return false;
  if (event.type === "ALERT" && !layers.alerts) return false;
  if (event.type === "REPORT" && !layers.reports) return false;
  if (event.status !== "RESOLVED" && event.severity !== "CRITICAL" && !layers.reports && event.type === "REPORT") return false;
  return true;
};

export default function OperationalMap({
  events,
  selectedEventId,
  location,
  locationStatus,
  layerSettings,
  onEventSelect,
  centerOnSelected = true,
}: Props) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const eventLayerRef = useRef<any>(null);
  const userLayerRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);

  const visibleEvents = useMemo(
    () => events.filter((event) => isEventVisible(event, layerSettings)),
    [events, layerSettings]
  );

  useEffect(() => {
    let isMounted = true;

    const initializeMap = async () => {
      if (!mapContainerRef.current || !isMounted) return;
      const L = (await import("leaflet")) as typeof import("leaflet");
      leafletRef.current = L;

      const map = L.map(mapContainerRef.current, {
        center: DEFAULT_CENTER,
        zoom: 11.2,
        zoomControl: true,
      });

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);

      eventLayerRef.current = L.layerGroup().addTo(map);
      userLayerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setMapReady(true);
    };

    if (!mapRef.current) {
      initializeMap();
    }

    return () => {
      isMounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      eventLayerRef.current = null;
      userLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !leafletRef.current) return;
    const L = leafletRef.current;
    const map = mapRef.current;
    const eventLayer = eventLayerRef.current;
    const userLayer = userLayerRef.current;

    eventLayer?.clearLayers();
    userLayer?.clearLayers();

    visibleEvents.forEach((event) => {
      const markerIcon = L.divIcon({
        html: renderToStaticMarkup(
          <IncidentMarker
            severity={event.severity}
            type={event.type}
            isSelected={event.id === selectedEventId}
          />
        ),
        className: "leaflet-div-icon bg-transparent p-0",
        iconSize: [56, 56],
        iconAnchor: [28, 28],
      });

      const marker = L.marker([event.latitude, event.longitude], {
        icon: markerIcon,
      }).addTo(eventLayer);

      marker.on("click", () => {
        onEventSelect?.(event);
      });
    });

    if (layerSettings.user && locationStatus !== "fallback") {
      const userIcon = L.divIcon({
        html: renderToStaticMarkup(<UserLocationMarker />),
        className: "leaflet-div-icon bg-transparent p-0",
        iconSize: [64, 64],
        iconAnchor: [32, 32],
      });
      L.marker([location.latitude, location.longitude], {
        icon: userIcon,
      }).addTo(userLayer);
    }

    if (selectedEventId && centerOnSelected) {
      const selectedEvent = visibleEvents.find((event) => event.id === selectedEventId);
      if (selectedEvent) {
        const lat = Number(selectedEvent.latitude);
        const lng = Number(selectedEvent.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        map.flyTo([lat, lng], 13, {
          duration: 0.8,
        });
      }
    }
  }, [mapReady, visibleEvents, selectedEventId, onEventSelect, layerSettings, location, locationStatus, centerOnSelected]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || selectedEventId) return;
    const lat = Number(location.latitude);
    const lng = Number(location.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    mapRef.current.flyTo([lat, lng], 12, {
      duration: 0.7,
    });
  }, [location.latitude, location.longitude, mapReady, selectedEventId]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-[32px] border border-white/10 bg-slate-950/50 shadow-2xl shadow-black/40">
      <div ref={mapContainerRef} className="argus-leaflet-map h-full w-full" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-slate-950/90 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-950/90 to-transparent" />
    </div>
  );
}
