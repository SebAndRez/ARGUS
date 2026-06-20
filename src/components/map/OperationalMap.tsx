"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CrisisEvent } from "@/types/crisis";
import type { UserLocationStatus } from "@/types/crisis";
import type { VisualSource } from "@/types/visualSource";
import type { RiskProjection } from "@/types/weatherRisk";
import type { ArgusRoute, BaseMapType, RouteType } from "@/types/map";
import type { ArgusNormalizedEvent } from "@/types/ingestion";
import { clusterEventsByGrid } from "@/lib/simpleEventClustering";
import EventClusterMarker from "@/components/map/EventClusterMarker";
import ExternalEventMarker from "@/components/map/ExternalEventMarker";
import IncidentMarker from "@/components/map/IncidentMarker";
import RiskProjectionOverlay from "@/components/map/RiskProjectionOverlay";
import RouteLayerOverlay from "@/components/map/RouteLayerOverlay";
import UserLocationMarker from "@/components/map/UserLocationMarker";
import VisualSourceMarker from "@/components/map/VisualSourceMarker";

interface MapLayerSettings {
  reports: boolean;
  demoReports?: boolean;
  usgsEarthquakes?: boolean;
  gdacsAlerts?: boolean;
  noaaTsunami?: boolean;
  nasaFirms?: boolean;
  reliefWeb?: boolean;
  sos: boolean;
  alerts: boolean;
  critical: boolean;
  resolved: boolean;
  user: boolean;
  visualSources?: boolean;
  officialSources?: boolean;
  publicCameras?: boolean;
  weatherRisk?: boolean;
  terrestrialRoutes?: boolean;
  airRoutes?: boolean;
  maritimeRoutes?: boolean;
}

interface Props {
  events: CrisisEvent[];
  demoEvents?: CrisisEvent[];
  externalEvents?: ArgusNormalizedEvent[];
  selectedEventId?: string;
  location: {
    latitude: number;
    longitude: number;
  };
  locationStatus: UserLocationStatus;
  layerSettings: MapLayerSettings;
  onEventSelect?: (event: CrisisEvent) => void;
  selectedExternalEventId?: string;
  onExternalEventSelect?: (event: ArgusNormalizedEvent) => void;
  visualSources?: VisualSource[];
  selectedVisualSourceId?: string;
  onVisualSourceSelect?: (source: VisualSource) => void;
  riskProjections?: RiskProjection[];
  onRiskProjectionSelect?: (projection: RiskProjection) => void;
  routes?: ArgusRoute[];
  baseMapType?: BaseMapType;
  centerOnSelected?: boolean;
  centerRequestKey?: number;
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
  demoEvents = [],
  externalEvents = [],
  selectedEventId,
  location,
  locationStatus,
  layerSettings,
  onEventSelect,
  selectedExternalEventId,
  onExternalEventSelect,
  visualSources = [],
  selectedVisualSourceId,
  onVisualSourceSelect,
  riskProjections = [],
  onRiskProjectionSelect,
  routes = [],
  baseMapType = "tactical",
  centerOnSelected = true,
  centerRequestKey = 0,
}: Props) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const eventLayerRef = useRef<any>(null);
  const demoEventLayerRef = useRef<any>(null);
  const externalEventLayerRef = useRef<any>(null);
  const visualSourceLayerRef = useRef<any>(null);
  const userLayerRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const visibleEvents = useMemo(
    () => events.filter((event) => isEventVisible(event, layerSettings)),
    [events, layerSettings]
  );
  const visibleDemoEvents = useMemo(
    () => (layerSettings.demoReports ? demoEvents : []),
    [demoEvents, layerSettings.demoReports]
  );
  const demoEventClusters = useMemo(
    () => clusterEventsByGrid(visibleDemoEvents),
    [visibleDemoEvents]
  );
  const visibleVisualSources = useMemo(() => {
    if (!layerSettings.visualSources) return [];

    return visualSources.filter((source) => {
      const isOfficial =
        source.category === "governmental_osint" ||
        source.category === "institutional_camera";
      const isPublicCamera =
        source.category === "open_public_camera" ||
        source.category === "commercial_webcam" ||
        source.category === "media_stream" ||
        source.category === "citizen_stream";

      if (isOfficial && layerSettings.officialSources === false) return false;
      if (isPublicCamera && layerSettings.publicCameras === false) return false;
      return true;
    });
  }, [
    layerSettings.officialSources,
    layerSettings.publicCameras,
    layerSettings.visualSources,
    visualSources,
  ]);
  const visibleRouteTypes = useMemo<Partial<Record<RouteType, boolean>>>(
    () => ({
      terrestrial: Boolean(layerSettings.terrestrialRoutes),
      air: Boolean(layerSettings.airRoutes),
      maritime: Boolean(layerSettings.maritimeRoutes),
    }),
    [
      layerSettings.airRoutes,
      layerSettings.maritimeRoutes,
      layerSettings.terrestrialRoutes,
    ]
  );

  useEffect(() => {
    let isMounted = true;

    const initializeMap = async () => {
      try {
        if (!mapContainerRef.current || !isMounted) return;
        const L = (await import("leaflet")) as typeof import("leaflet");
        if (!mapContainerRef.current || !isMounted) return;
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
        demoEventLayerRef.current = L.layerGroup().addTo(map);
        externalEventLayerRef.current = L.layerGroup().addTo(map);
        visualSourceLayerRef.current = L.layerGroup().addTo(map);
        userLayerRef.current = L.layerGroup().addTo(map);
        mapRef.current = map;
        setMapError(null);
        setMapReady(true);

        window.requestAnimationFrame(() => {
          if (isMounted && mapRef.current) mapRef.current.invalidateSize(false);
        });
      } catch {
        if (isMounted) {
          setMapReady(false);
          setMapError(
            "El mapa no pudo iniciarse en este navegador. Las alertas y controles siguen disponibles."
          );
        }
      }
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
      demoEventLayerRef.current = null;
      externalEventLayerRef.current = null;
      visualSourceLayerRef.current = null;
      userLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    let frameId: number | null = null;
    const invalidateMapSize = () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        mapRef.current?.invalidateSize(false);
        frameId = null;
      });
    };

    const container = mapContainerRef.current;
    const resizeObserver =
      container && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(invalidateMapSize)
        : null;
    if (container) resizeObserver?.observe(container);
    window.addEventListener("resize", invalidateMapSize);
    window.addEventListener("orientationchange", invalidateMapSize);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", invalidateMapSize);
      window.removeEventListener("orientationchange", invalidateMapSize);
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, [mapReady]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !leafletRef.current) return;
    const L = leafletRef.current;
    const map = mapRef.current;
    const eventLayer = eventLayerRef.current;
    const demoEventLayer = demoEventLayerRef.current;
    const externalEventLayer = externalEventLayerRef.current;
    const visualSourceLayer = visualSourceLayerRef.current;
    const userLayer = userLayerRef.current;

    eventLayer?.clearLayers();
    demoEventLayer?.clearLayers();
    externalEventLayer?.clearLayers();
    visualSourceLayer?.clearLayers();
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

    demoEventClusters.forEach((cluster) => {
      const primaryEvent = cluster.events[0];
      if (!primaryEvent) return;

      const clusterIcon = L.divIcon({
        html: renderToStaticMarkup(
          <EventClusterMarker
            cluster={cluster}
            isSelected={cluster.events.some((event) => event.id === selectedEventId)}
          />
        ),
        className: "leaflet-div-icon bg-transparent p-0",
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      });

      const marker = L.marker([cluster.latitude, cluster.longitude], {
        icon: clusterIcon,
        title: `${cluster.count} reportes demo`,
      }).addTo(demoEventLayer);

      marker.bindTooltip(
        `${cluster.count} reportes demo · prioridad ${cluster.priorityScore} · ${cluster.highestSeverity}`,
        {
          direction: "top",
          offset: [0, -18],
          opacity: 0.95,
        }
      );
      marker.on("click", () => {
        onEventSelect?.(primaryEvent);
      });
    });

    externalEvents
      .filter(
        (event) =>
          (event.sourceId === "usgs_earthquake" && layerSettings.usgsEarthquakes) ||
          (event.sourceId === "gdacs" && layerSettings.gdacsAlerts) ||
          (event.sourceId === "noaa_tsunami" && layerSettings.noaaTsunami) ||
          (event.sourceId === "nasa_firms" && layerSettings.nasaFirms)
      )
      .forEach((event) => {
        const latitude =
          typeof event.latitude === "number" ? event.latitude : Number.NaN;
        const longitude =
          typeof event.longitude === "number" ? event.longitude : Number.NaN;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

        const markerIcon = L.divIcon({
          html: renderToStaticMarkup(
            <ExternalEventMarker
              event={event}
              isSelected={event.id === selectedExternalEventId}
            />
          ),
          className: "argus-external-event-icon leaflet-div-icon bg-transparent p-0",
          iconSize: [44, 44],
          iconAnchor: [22, 22],
        });

        const marker = L.marker([latitude, longitude], {
          icon: markerIcon,
          title: event.title,
        }).addTo(externalEventLayer);

        marker.bindTooltip(
          `${event.title} · ${event.sourceName} · confianza ${event.confidence}%`,
          {
            direction: "top",
            offset: [0, -18],
            opacity: 0.95,
          }
        );
        marker.on("click", () => onExternalEventSelect?.(event));
      });

    visibleVisualSources.forEach((source) => {
      const lat = Number(source.latitude);
      const lng = Number(source.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const markerIcon = L.divIcon({
        html: renderToStaticMarkup(
          <VisualSourceMarker source={source} isSelected={source.id === selectedVisualSourceId} />
        ),
        className: "argus-visual-source-icon leaflet-div-icon bg-transparent p-0",
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });

      const marker = L.marker([lat, lng], {
        icon: markerIcon,
        title: source.title,
      }).addTo(visualSourceLayer);

      marker.bindTooltip(source.title, {
        direction: "top",
        offset: [0, -18],
        opacity: 0.9,
      });
      marker.on("click", () => {
        onVisualSourceSelect?.(source);
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
      const selectedEvent =
        visibleEvents.find((event) => event.id === selectedEventId) ??
        visibleDemoEvents.find((event) => event.id === selectedEventId);
      if (selectedEvent) {
        const lat = Number(selectedEvent.latitude);
        const lng = Number(selectedEvent.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        map.flyTo([lat, lng], 13, {
          duration: 0.8,
        });
      }
    }
  }, [
    mapReady,
    visibleEvents,
    visibleDemoEvents,
    demoEventClusters,
    externalEvents,
    visibleVisualSources,
    selectedEventId,
    selectedVisualSourceId,
    selectedExternalEventId,
    onEventSelect,
    onExternalEventSelect,
    onVisualSourceSelect,
    layerSettings,
    location,
    locationStatus,
    centerOnSelected,
  ]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || selectedEventId) return;
    const lat = Number(location.latitude);
    const lng = Number(location.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    mapRef.current.flyTo([lat, lng], 12, {
      duration: 0.7,
    });
  }, [location.latitude, location.longitude, mapReady, selectedEventId]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || centerRequestKey === 0) return;
    const lat = Number(location.latitude);
    const lng = Number(location.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    mapRef.current.flyTo([lat, lng], 13, { duration: 0.6 });
  }, [centerRequestKey, location.latitude, location.longitude, mapReady]);

  return (
    <div
      className={`argus-map-${baseMapType} relative h-full min-h-80 w-full overflow-hidden rounded-lg border border-white/10 bg-slate-950/50 shadow-2xl shadow-black/40`}
    >
      <div ref={mapContainerRef} className="argus-leaflet-map h-full w-full" />
      {mapError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/95 p-6">
          <div className="max-w-sm border border-amber-300/25 bg-amber-400/10 p-4 text-center">
            <p className="text-sm font-semibold text-amber-100">
              Mapa temporalmente no disponible
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-300">{mapError}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 min-h-11 border border-cyan-300/30 bg-cyan-400 px-4 py-2 text-sm font-bold text-slate-950"
            >
              Reintentar
            </button>
          </div>
        </div>
      )}
      <RiskProjectionOverlay
        projections={riskProjections}
        visible={Boolean(layerSettings.weatherRisk)}
        onProjectionSelect={onRiskProjectionSelect}
        map={mapReady ? mapRef.current : null}
        leaflet={mapReady ? leafletRef.current : null}
      />
      <RouteLayerOverlay
        routes={routes}
        visibleTypes={visibleRouteTypes}
        map={mapReady ? mapRef.current : null}
        leaflet={mapReady ? leafletRef.current : null}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-slate-950/90 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-950/90 to-transparent" />
    </div>
  );
}
