"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CrisisEvent } from "@/types/crisis";
import type { UserLocationStatus } from "@/types/crisis";
import type { VisualSource } from "@/types/visualSource";
import type { RiskProjection } from "@/types/weatherRisk";
import type { ArgusRoute, BaseMapType, RouteType } from "@/types/map";
import type { ArgusNormalizedEvent } from "@/types/ingestion";
import { clusterEventsByGrid } from "@/lib/simpleEventClustering";
import GlobeView from "@/components/map/GlobeView";
import MapToGlobeTransition from "@/components/map/MapToGlobeTransition";
import RiskProjectionOverlay from "@/components/map/RiskProjectionOverlay";
import RouteLayerOverlay from "@/components/map/RouteLayerOverlay";
import {
  createArgusDivIcon,
  type ArgusMapConfidence,
  type ArgusMapEventKind,
  type ArgusMapSeverity,
} from "@/lib/mapSymbols/argusMapSymbols";

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
const GLOBE_ZOOM_THRESHOLD = 2;
const MAP_RETURN_ZOOM = GLOBE_ZOOM_THRESHOLD + 2;

const isEventVisible = (event: CrisisEvent, layers: MapLayerSettings) => {
  if (event.status === "RESOLVED" && !layers.resolved) return false;
  if (event.severity === "CRITICAL" && !layers.critical) return false;
  if (event.type === "SOS" && !layers.sos) return false;
  if (event.type === "ALERT" && !layers.alerts) return false;
  if (event.type === "REPORT" && !layers.reports) return false;
  if (event.status !== "RESOLVED" && event.severity !== "CRITICAL" && !layers.reports && event.type === "REPORT") return false;
  return true;
};

const toMapSeverity = (value: string | null | undefined): ArgusMapSeverity => {
  const normalized = value?.toLowerCase();
  if (normalized === "critical") return "critical";
  if (normalized === "high") return "high";
  if (normalized === "medium") return "medium";
  if (normalized === "low") return "low";
  return "info";
};

const getInternalEventKind = (event: CrisisEvent): ArgusMapEventKind => {
  if (event.type === "SOS") return "force_report";
  if (event.type === "REPORT") return "citizen_report";
  if (event.category?.toLowerCase().includes("fire")) return "fire";
  if (event.category?.toLowerCase().includes("weather")) return "weather";
  return "risk_assessment";
};

const getExternalEventKind = (event: ArgusNormalizedEvent): ArgusMapEventKind => {
  if (event.sourceId === "usgs_earthquake" || event.category === "earthquake") {
    return "earthquake";
  }
  if (event.sourceId === "noaa_tsunami" || event.category === "tsunami") {
    return "tsunami";
  }
  if (
    event.sourceId === "nasa_firms" ||
    event.category === "wildfire" ||
    event.category === "thermal_anomaly"
  ) {
    return "fire";
  }
  if (["weather", "cyclone", "flood"].includes(event.category)) return "weather";
  return "official_source";
};

const getExternalConfidence = (
  event: ArgusNormalizedEvent
): ArgusMapConfidence => {
  if (event.sourceId === "usgs_earthquake" || event.sourceId === "noaa_tsunami") {
    return "official";
  }
  if (event.sourceId === "gdacs") return "multi_source";
  if (event.sourceId === "nasa_firms") return "raw";
  return event.confidence >= 85 ? "verified" : "unknown";
};

const getVisualSourceKind = (source: VisualSource): ArgusMapEventKind => {
  if (
    source.category === "open_public_camera" ||
    source.category === "commercial_webcam" ||
    source.category === "media_stream" ||
    source.category === "citizen_stream"
  ) {
    return "live_camera";
  }
  return "official_source";
};

const getVisualSourceConfidence = (source: VisualSource): ArgusMapConfidence => {
  if (source.category === "argus_verified_sensor") return "verified";
  if (
    source.category === "governmental_osint" ||
    source.category === "institutional_camera"
  ) {
    return "official";
  }
  if (source.category === "unverified_source") return "raw";
  return "reported";
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
  const suppressGlobeModeRef = useRef(false);
  const lastUsefulMapViewRef = useRef<{
    center: [number, number];
    zoom: number;
  }>({ center: DEFAULT_CENTER, zoom: 11.2 });
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [isGlobeMode, setIsGlobeMode] = useState(false);

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
  const visibleExternalEvents = useMemo(
    () =>
      externalEvents.filter(
        (event) =>
          (event.sourceId === "usgs_earthquake" && layerSettings.usgsEarthquakes) ||
          (event.sourceId === "gdacs" && layerSettings.gdacsAlerts) ||
          (event.sourceId === "noaa_tsunami" && layerSettings.noaaTsunami) ||
          (event.sourceId === "nasa_firms" && layerSettings.nasaFirms)
      ),
    [
      externalEvents,
      layerSettings.gdacsAlerts,
      layerSettings.nasaFirms,
      layerSettings.noaaTsunami,
      layerSettings.usgsEarthquakes,
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
          zoomControl: false,
          worldCopyJump: true,
        });

        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "© OpenStreetMap contributors",
        }).addTo(map);
        L.control.zoom({ position: "bottomleft" }).addTo(map);

        eventLayerRef.current = L.layerGroup().addTo(map);
        demoEventLayerRef.current = L.layerGroup().addTo(map);
        externalEventLayerRef.current = L.layerGroup().addTo(map);
        visualSourceLayerRef.current = L.layerGroup().addTo(map);
        userLayerRef.current = L.layerGroup().addTo(map);
        mapRef.current = map;
        setMapError(null);
        setMapReady(true);
        setIsGlobeMode(map.getZoom() <= GLOBE_ZOOM_THRESHOLD);

        const rememberUsefulView = () => {
          const zoom = map.getZoom();
          if (zoom > GLOBE_ZOOM_THRESHOLD) {
            const center = map.getCenter();
            lastUsefulMapViewRef.current = {
              center: [center.lat, center.lng],
              zoom,
            };
          }
        };

        const handleZoomEnd = () => {
          const zoom = map.getZoom();
          if (zoom > GLOBE_ZOOM_THRESHOLD) {
            rememberUsefulView();
            suppressGlobeModeRef.current = false;
            setIsGlobeMode(false);
            return;
          }
          if (suppressGlobeModeRef.current) {
            setIsGlobeMode(false);
            return;
          }
          setIsGlobeMode(true);
        };
        map.on("zoomstart", rememberUsefulView);
        map.on("movestart", rememberUsefulView);
        map.on("zoomend", handleZoomEnd);

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
      const iconDefinition = createArgusDivIcon({
        kind: getInternalEventKind(event),
        severity: toMapSeverity(event.severity),
        confidence: event.type === "REPORT" ? "reported" : "verified",
        label: event.type === "SOS" ? "SOS" : event.type === "ALERT" ? "A" : "R",
        title: event.title,
        active: event.status !== "RESOLVED",
        selected: event.id === selectedEventId,
      });
      const markerIcon = L.divIcon(iconDefinition);

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

      const clusterIcon = L.divIcon(createArgusDivIcon({
        kind: "citizen_report",
        severity: toMapSeverity(cluster.highestSeverity),
        confidence: "reported",
        label: String(cluster.count),
        title: `${cluster.count} reportes demo`,
        active: cluster.highestSeverity === "CRITICAL" || cluster.highestSeverity === "HIGH",
        selected: cluster.events.some((event) => event.id === selectedEventId),
      }));

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

    visibleExternalEvents
      .forEach((event) => {
        const latitude =
          typeof event.latitude === "number" ? event.latitude : Number.NaN;
        const longitude =
          typeof event.longitude === "number" ? event.longitude : Number.NaN;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

        const markerIcon = L.divIcon(createArgusDivIcon({
          kind: getExternalEventKind(event),
          severity: toMapSeverity(event.severity),
          confidence: getExternalConfidence(event),
          label:
            typeof event.rawMagnitude === "number"
              ? event.rawMagnitude.toFixed(1)
              : event.sourceId === "nasa_firms"
                ? "FIR"
                : event.sourceId === "noaa_tsunami"
                  ? "TSU"
                  : event.sourceId === "gdacs"
                    ? "GD"
                    : undefined,
          title: event.title,
          active: event.severity === "critical" || event.severity === "high",
          selected: event.id === selectedExternalEventId,
        }));

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

      const defaultLabel =
        source.category === "argus_verified_sensor"
          ? "ARG"
          : getVisualSourceKind(source) === "live_camera"
            ? "C"
            : source.shortCode || source.markerLabel || "I";
      const markerIcon = L.divIcon(createArgusDivIcon({
        kind: getVisualSourceKind(source),
        severity: source.status === "offline" ? "inactive" : "info",
        confidence: getVisualSourceConfidence(source),
        label: defaultLabel,
        title: source.title,
        active: source.status === "live",
        selected: source.id === selectedVisualSourceId,
      }));

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
      const userIcon = L.divIcon(createArgusDivIcon({
        kind: "user",
        severity: locationStatus === "granted" ? "info" : "inactive",
        confidence: locationStatus === "granted" ? "verified" : "unknown",
        label: "MI",
        title: "Mi ubicación",
        active: locationStatus === "granted",
      }));
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
    visibleExternalEvents,
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

  const exitGlobeMode = () => {
    suppressGlobeModeRef.current = true;
    setIsGlobeMode(false);
    if (!mapRef.current) {
      return;
    }
    const previousView = lastUsefulMapViewRef.current;
    const returnZoom = Math.max(previousView.zoom, MAP_RETURN_ZOOM);
    mapRef.current.setView(previousView.center, returnZoom, {
      animate: true,
      duration: 0.35,
    });
    window.requestAnimationFrame(() => {
      setIsGlobeMode(false);
      mapRef.current?.invalidateSize(false);
    });
  };

  return (
    <div
      className={`argus-map-${baseMapType} relative h-full min-h-80 w-full overflow-hidden rounded-lg border border-white/10 bg-slate-950/50 shadow-2xl shadow-black/40 ${
        isGlobeMode ? "argus-orbit-active" : ""
      }`}
      onWheelCapture={(event) => {
        if (isGlobeMode && event.deltaY < 0) {
          event.preventDefault();
          exitGlobeMode();
        }
      }}
    >
      <MapToGlobeTransition
        isGlobeMode={isGlobeMode}
        map={
          <>
            <div ref={mapContainerRef} className="argus-leaflet-map h-full w-full" />
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
          </>
        }
        globe={
          <GlobeView
            active={isGlobeMode}
            events={visibleEvents}
            demoEvents={visibleDemoEvents}
            externalEvents={visibleExternalEvents}
            onSelectEvent={onEventSelect}
            onSelectExternalEvent={onExternalEventSelect}
            onExitGlobe={exitGlobeMode}
          />
        }
      />
      {isGlobeMode && (
        <button
          type="button"
          onClick={exitGlobeMode}
          onMouseDown={exitGlobeMode}
          onTouchEnd={exitGlobeMode}
          className="absolute right-4 top-4 z-[70] min-h-10 border border-cyan-300/35 bg-slate-950/90 px-3 py-2 text-xs font-bold uppercase text-cyan-100 shadow-lg shadow-black/30 backdrop-blur-xl transition hover:bg-cyan-300/15"
        >
          Salir de Orbit
        </button>
      )}
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
    </div>
  );
}
