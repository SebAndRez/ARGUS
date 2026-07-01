"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CrisisEvent } from "@/types/crisis";
import type { UserLocationStatus } from "@/types/crisis";
import type { VisualSource } from "@/types/visualSource";
import type { ArgusLiveCamera } from "@/types/liveCamera";
import type { RiskProjection } from "@/types/weatherRisk";
import type { ArgusRoute, BaseMapType, RouteType } from "@/types/map";
import type { ArgusNormalizedEvent } from "@/types/ingestion";
import type { MedicalAidRequest, MedicalPoint } from "@/types/medical";
import type {
  ConflictCoordinates,
  ConflictEvent,
  ConflictZone,
} from "@/types/conflictZone";
import type { NewsEvidence } from "@/types/newsEvidence";
import type { SafetyCheck } from "@/types/mobileSafety";
import type { QuakeSenseCluster } from "@/types/quakesense";
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
  missingPersons?: boolean;
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
  liveCameras?: boolean;
  medicalPoints?: boolean;
  quakeSense?: boolean;
  safetyChecks?: boolean;
  weatherRisk?: boolean;
  terrestrialRoutes?: boolean;
  airRoutes?: boolean;
  maritimeRoutes?: boolean;
  conflictZones?: boolean;
  conflictEvents?: boolean;
  territorialControl?: boolean;
  crisisNews?: boolean;
  confirmedDisasters?: boolean;
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
  liveCameras?: ArgusLiveCamera[];
  selectedLiveCameraId?: string;
  onLiveCameraSelect?: (camera: ArgusLiveCamera) => void;
  medicalPoints?: MedicalPoint[];
  medicalAidRequest?: MedicalAidRequest | null;
  quakeSenseClusters?: QuakeSenseCluster[];
  safetyChecks?: SafetyCheck[];
  riskProjections?: RiskProjection[];
  onRiskProjectionSelect?: (projection: RiskProjection) => void;
  routes?: ArgusRoute[];
  conflictZones?: ConflictZone[];
  conflictEvents?: ConflictEvent[];
  newsEvidence?: NewsEvidence[];
  selectedConflictZoneId?: string;
  onConflictZoneSelect?: (zone: ConflictZone) => void;
  baseMapType?: BaseMapType;
  centerOnSelected?: boolean;
  centerRequestKey?: number;
  viewMode?: "map" | "orbit";
  onViewModeChange?: (mode: "map" | "orbit") => void;
}

const DEFAULT_CENTER: [number, number] = [-33.4489, -70.6693];
const GLOBE_ZOOM_THRESHOLD = 2;
const MAP_RETURN_ZOOM = GLOBE_ZOOM_THRESHOLD + 2;

const isEventVisible = (event: CrisisEvent, layers: MapLayerSettings) => {
  if (event.category?.toLowerCase() === "missing_person" && !layers.missingPersons) {
    return false;
  }
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
  if (event.category?.toLowerCase() === "missing_person") return "force_report";
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

const isBboxCoordinates = (
  coordinates: ConflictCoordinates
): coordinates is { north: number; south: number; east: number; west: number } =>
  !Array.isArray(coordinates) &&
  typeof coordinates === "object" &&
  coordinates !== null &&
  "north" in coordinates &&
  "south" in coordinates &&
  "east" in coordinates &&
  "west" in coordinates;

const isCoordinatePair = (
  coordinates: ConflictCoordinates
): coordinates is [number, number] =>
  Array.isArray(coordinates) &&
  coordinates.length === 2 &&
  typeof coordinates[0] === "number" &&
  typeof coordinates[1] === "number";

const isCoordinatePolygon = (
  coordinates: ConflictCoordinates
): coordinates is Array<[number, number]> =>
  Array.isArray(coordinates) &&
  coordinates.length > 0 &&
  Array.isArray(coordinates[0]);

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
  liveCameras = [],
  selectedLiveCameraId,
  onLiveCameraSelect,
  medicalPoints = [],
  medicalAidRequest = null,
  quakeSenseClusters = [],
  safetyChecks = [],
  riskProjections = [],
  onRiskProjectionSelect,
  routes = [],
  conflictZones = [],
  conflictEvents = [],
  newsEvidence = [],
  selectedConflictZoneId,
  onConflictZoneSelect,
  baseMapType = "tactical",
  centerOnSelected = true,
  centerRequestKey = 0,
  viewMode,
  onViewModeChange,
}: Props) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const eventLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const demoEventLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const externalEventLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const visualSourceLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const liveCameraLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const medicalLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const quakeSenseLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const safetyCheckLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const conflictZoneLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const conflictEventLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const newsEvidenceLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const userLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const suppressGlobeModeRef = useRef(false);
  const viewModeRef = useRef(viewMode);
  const onViewModeChangeRef = useRef(onViewModeChange);
  const lastUsefulMapViewRef = useRef<{
    center: [number, number];
    zoom: number;
  }>({ center: DEFAULT_CENTER, zoom: 11.2 });
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [isGlobeMode, setIsGlobeMode] = useState(false);
  const [mapInstance, setMapInstance] = useState<import("leaflet").Map | null>(null);
  const [leafletInstance, setLeafletInstance] =
    useState<typeof import("leaflet") | null>(null);

  useEffect(() => {
    viewModeRef.current = viewMode;
    onViewModeChangeRef.current = onViewModeChange;
  }, [onViewModeChange, viewMode]);

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
  const visibleLiveCameras = useMemo(() => {
    if (!layerSettings.liveCameras) return [];

    return liveCameras.filter((camera) => {
      const lat = Number(camera.latitude);
      const lng = Number(camera.longitude);
      return Number.isFinite(lat) && Number.isFinite(lng);
    });
  }, [layerSettings.liveCameras, liveCameras]);
  const visibleMedicalPoints = useMemo(() => {
    if (!layerSettings.medicalPoints) return [];

    return medicalPoints.filter((point) => {
      const lat = Number(point.latitude);
      const lng = Number(point.longitude);
      return Number.isFinite(lat) && Number.isFinite(lng);
    });
  }, [layerSettings.medicalPoints, medicalPoints]);
  const visibleQuakeSenseClusters = useMemo(
    () =>
      layerSettings.quakeSense
        ? quakeSenseClusters.filter(
            (cluster) =>
              Number.isFinite(cluster.centerLat) &&
              Number.isFinite(cluster.centerLng)
          )
        : [],
    [layerSettings.quakeSense, quakeSenseClusters]
  );
  const visibleSafetyChecks = useMemo(
    () =>
      layerSettings.safetyChecks
        ? safetyChecks.filter(
            (check) =>
              typeof check.lastApproxLat === "number" &&
              Number.isFinite(check.lastApproxLat) &&
              typeof check.lastApproxLng === "number" &&
              Number.isFinite(check.lastApproxLng)
          )
        : [],
    [layerSettings.safetyChecks, safetyChecks]
  );
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
  const visibleConflictZones = useMemo(
    () =>
      conflictZones.filter((zone) => {
        if (!zone.isActive || !layerSettings.conflictZones) return false;
        if (
          zone.zoneType === "disaster_confirmed" &&
          layerSettings.confirmedDisasters === false
        ) {
          return false;
        }
        if (
          ["disputed_control", "occupied_area"].includes(zone.zoneType) &&
          layerSettings.territorialControl === false
        ) {
          return false;
        }
        return true;
      }),
    [
      conflictZones,
      layerSettings.confirmedDisasters,
      layerSettings.conflictZones,
      layerSettings.territorialControl,
    ]
  );
  const visibleConflictEvents = useMemo(
    () => (layerSettings.conflictEvents ? conflictEvents : []),
    [conflictEvents, layerSettings.conflictEvents]
  );
  const visibleNewsEvidence = useMemo(
    () =>
      layerSettings.crisisNews
        ? newsEvidence.filter(
            (item) => typeof item.lat === "number" && typeof item.lng === "number"
          )
        : [],
    [layerSettings.crisisNews, newsEvidence]
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
        liveCameraLayerRef.current = L.layerGroup().addTo(map);
        medicalLayerRef.current = L.layerGroup().addTo(map);
        quakeSenseLayerRef.current = L.layerGroup().addTo(map);
        safetyCheckLayerRef.current = L.layerGroup().addTo(map);
        conflictZoneLayerRef.current = L.layerGroup().addTo(map);
        conflictEventLayerRef.current = L.layerGroup().addTo(map);
        newsEvidenceLayerRef.current = L.layerGroup().addTo(map);
        userLayerRef.current = L.layerGroup().addTo(map);
        mapRef.current = map;
        setMapInstance(map);
        setLeafletInstance(L);
        setMapError(null);
        setMapReady(true);
        const shouldStartInOrbit =
          viewModeRef.current === "orbit" ||
          (viewModeRef.current === undefined && map.getZoom() <= GLOBE_ZOOM_THRESHOLD);
        setIsGlobeMode(shouldStartInOrbit);

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
            onViewModeChangeRef.current?.("map");
            return;
          }
          if (suppressGlobeModeRef.current) {
            setIsGlobeMode(false);
            onViewModeChangeRef.current?.("map");
            return;
          }
          setIsGlobeMode(true);
          onViewModeChangeRef.current?.("orbit");
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
      setMapInstance(null);
      setLeafletInstance(null);
      eventLayerRef.current = null;
      demoEventLayerRef.current = null;
      externalEventLayerRef.current = null;
      visualSourceLayerRef.current = null;
      liveCameraLayerRef.current = null;
      medicalLayerRef.current = null;
      quakeSenseLayerRef.current = null;
      safetyCheckLayerRef.current = null;
      conflictZoneLayerRef.current = null;
      conflictEventLayerRef.current = null;
      newsEvidenceLayerRef.current = null;
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
    const liveCameraLayer = liveCameraLayerRef.current;
    const medicalLayer = medicalLayerRef.current;
    const quakeSenseLayer = quakeSenseLayerRef.current;
    const safetyCheckLayer = safetyCheckLayerRef.current;
    const conflictZoneLayer = conflictZoneLayerRef.current;
    const conflictEventLayer = conflictEventLayerRef.current;
    const newsEvidenceLayer = newsEvidenceLayerRef.current;
    const userLayer = userLayerRef.current;

    if (
      !eventLayer ||
      !demoEventLayer ||
      !externalEventLayer ||
      !visualSourceLayer ||
      !liveCameraLayer ||
      !medicalLayer ||
      !quakeSenseLayer ||
      !safetyCheckLayer ||
      !conflictZoneLayer ||
      !conflictEventLayer ||
      !newsEvidenceLayer ||
      !userLayer
    ) {
      return;
    }

    eventLayer?.clearLayers();
    demoEventLayer?.clearLayers();
    externalEventLayer?.clearLayers();
    visualSourceLayer?.clearLayers();
    liveCameraLayer?.clearLayers();
    medicalLayer?.clearLayers();
    quakeSenseLayer?.clearLayers();
    safetyCheckLayer?.clearLayers();
    conflictZoneLayer?.clearLayers();
    conflictEventLayer?.clearLayers();
    newsEvidenceLayer?.clearLayers();
    userLayer?.clearLayers();

    const riskColor: Record<string, string> = {
      low: "#22d3ee",
      medium: "#facc15",
      high: "#fb923c",
      critical: "#ef4444",
    };

    visibleConflictZones.forEach((zone) => {
      const color = riskColor[zone.riskLevel] ?? "#fb923c";
      let layer: import("leaflet").Layer | null = null;

      if (zone.geometryType === "bbox" && isBboxCoordinates(zone.coordinates)) {
        layer = L.rectangle(
          [
            [zone.coordinates.south, zone.coordinates.west],
            [zone.coordinates.north, zone.coordinates.east],
          ],
          {
            color,
            weight: zone.id === selectedConflictZoneId ? 3 : 1.5,
            fillColor: color,
            fillOpacity: zone.zoneType === "disputed_control" ? 0.08 : 0.12,
            dashArray:
              zone.controlStatus === "contested" || zone.controlStatus === "disputed"
                ? "6 6"
                : undefined,
          }
        ).addTo(conflictZoneLayer);
      } else if (zone.geometryType === "polygon" && isCoordinatePolygon(zone.coordinates)) {
        layer = L.polygon(zone.coordinates, {
          color,
          weight: zone.id === selectedConflictZoneId ? 3 : 1.5,
          fillColor: color,
          fillOpacity: 0.1,
          dashArray:
            zone.controlStatus === "contested" || zone.controlStatus === "disputed"
              ? "6 6"
              : undefined,
        }).addTo(conflictZoneLayer);
      } else if (zone.geometryType === "point" && isCoordinatePair(zone.coordinates)) {
        const markerIcon = L.divIcon(createArgusDivIcon({
          kind: "risk_assessment",
          severity: toMapSeverity(zone.riskLevel),
          confidence: zone.confidence === "high" ? "verified" : zone.confidence === "medium" ? "reported" : "raw",
          label: "CZ",
          title: zone.name,
          active: true,
          selected: zone.id === selectedConflictZoneId,
        }));
        layer = L.marker(zone.coordinates, {
          icon: markerIcon,
          title: zone.name,
        }).addTo(conflictZoneLayer);
      }

      if (!layer) return;
      layer.bindTooltip(`${zone.name} · ${zone.riskLevel} · ${zone.confidence}`, {
        direction: "top",
        opacity: 0.92,
      });
      layer.on("click", () => onConflictZoneSelect?.(zone));
    });

    visibleConflictEvents.forEach((event) => {
      const markerIcon = L.divIcon(createArgusDivIcon({
        kind: event.eventType === "confirmed_disaster" ? "official_source" : "risk_assessment",
        severity: toMapSeverity(event.severity),
        confidence: event.confidence === "high" ? "verified" : event.confidence === "medium" ? "reported" : "raw",
        label: event.eventType === "humanitarian_alert" ? "H" : "ATK",
        title: event.title,
        active: true,
      }));
      const marker = L.marker([event.lat, event.lng], {
        icon: markerIcon,
        title: event.title,
      }).addTo(conflictEventLayer);
      marker.bindTooltip(`${event.title} · ${event.sourceName}`, {
        direction: "top",
        offset: [0, -18],
        opacity: 0.92,
      });
      const relatedZone = conflictZones.find((zone) => zone.id === event.relatedZoneId);
      marker.on("click", () => {
        if (relatedZone) onConflictZoneSelect?.(relatedZone);
      });
    });

    visibleNewsEvidence.forEach((item) => {
      if (typeof item.lat !== "number" || typeof item.lng !== "number") return;
      const markerIcon = L.divIcon(createArgusDivIcon({
        kind: "official_source",
        severity: "info",
        confidence: item.confidence === "high" ? "verified" : item.confidence === "medium" ? "reported" : "raw",
        label: "N",
        title: item.title,
        active: false,
      }));
      const marker = L.marker([item.lat, item.lng], {
        icon: markerIcon,
        title: item.title,
      }).addTo(newsEvidenceLayer);
      marker.bindTooltip(`${item.sourceName} · ${item.title}`, {
        direction: "top",
        offset: [0, -18],
        opacity: 0.9,
      });
      const relatedZone = conflictZones.find((zone) => zone.id === item.linkedZoneId);
      marker.on("click", () => {
        if (relatedZone) onConflictZoneSelect?.(relatedZone);
      });
    });

    visibleEvents.forEach((event) => {
      const iconDefinition = createArgusDivIcon({
        kind: getInternalEventKind(event),
        severity: toMapSeverity(event.severity),
        confidence: event.type === "REPORT" ? "reported" : "verified",
        label:
          event.category?.toLowerCase() === "missing_person"
            ? "MP"
            : event.type === "SOS"
              ? "SOS"
              : event.type === "ALERT"
                ? "A"
                : "R",
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

    visibleLiveCameras.forEach((camera) => {
      const lat = Number(camera.latitude);
      const lng = Number(camera.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const markerIcon = L.divIcon(createArgusDivIcon({
        kind: "live_camera",
        severity: camera.status === "active" ? "info" : "inactive",
        confidence: camera.provider === "youtube" ? "reported" : "raw",
        label: camera.markerLabel,
        title: camera.title,
        active: camera.status === "active",
        selected: camera.id === selectedLiveCameraId,
      }));

      const marker = L.marker([lat, lng], {
        icon: markerIcon,
        title: camera.title,
      }).addTo(liveCameraLayer);

      marker.bindTooltip(
        `${camera.title} · ${camera.provider.toUpperCase()} · ${
          camera.embedAllowed ? "embed" : "externa"
        }`,
        {
          direction: "top",
          offset: [0, -18],
          opacity: 0.92,
        }
      );
      marker.on("click", () => {
        onLiveCameraSelect?.(camera);
      });
    });

    visibleMedicalPoints.forEach((point) => {
      const markerIcon = L.divIcon(createArgusDivIcon({
        kind: "official_source",
        severity: point.status === "operational" ? "info" : "medium",
        confidence: point.source === "demo" ? "reported" : "official",
        label: "MED",
        title: point.name,
        active: point.status === "operational",
      }));
      const marker = L.marker([point.latitude, point.longitude], {
        icon: markerIcon,
        title: point.name,
      }).addTo(medicalLayer);
      marker.bindTooltip(`${point.name} - ${point.type}`, {
        direction: "top",
        offset: [0, -18],
        opacity: 0.92,
      });
    });

    if (medicalAidRequest) {
      const markerIcon = L.divIcon(createArgusDivIcon({
        kind: "force_report",
        severity: toMapSeverity(medicalAidRequest.severity),
        confidence: "reported",
        label: "SOS",
        title: "SOS Medico",
        active: medicalAidRequest.status !== "resolved",
      }));
      L.marker([medicalAidRequest.latitude, medicalAidRequest.longitude], {
        icon: markerIcon,
        title: "SOS Medico",
      }).addTo(medicalLayer);
    }

    visibleQuakeSenseClusters.forEach((cluster) => {
      const severity =
        cluster.severity === "high"
          ? "high"
          : cluster.severity === "medium"
            ? "medium"
            : "info";
      const markerIcon = L.divIcon(createArgusDivIcon({
        kind: "earthquake",
        severity,
        confidence:
          cluster.status === "MULTI_DEVICE_PATTERN" ||
          cluster.status === "OFFICIAL_CORRELATED"
            ? "multi_source"
            : "reported",
        label: `QS${cluster.signalCount}`,
        title: "ARGUS QuakeSense",
        active: true,
      }));
      const marker = L.marker([cluster.centerLat, cluster.centerLng], {
        icon: markerIcon,
        title: "ARGUS QuakeSense",
      }).addTo(quakeSenseLayer);
      marker.bindTooltip(
        `Alerta preliminar ARGUS · ${cluster.signalCount} señales · ${cluster.confidence}%`,
        {
          direction: "top",
          offset: [0, -18],
          opacity: 0.94,
        }
      );
    });

    visibleSafetyChecks.forEach((check) => {
      if (
        typeof check.lastApproxLat !== "number" ||
        typeof check.lastApproxLng !== "number"
      ) {
        return;
      }
      const severity =
        check.status === "ESCALATED" ||
        check.status === "USER_TRAPPED" ||
        check.status === "USER_NEEDS_HELP"
          ? "high"
          : check.status === "USER_SAFE"
            ? "low"
            : "medium";
      const label =
        check.status === "USER_SAFE"
          ? "OK"
          : check.status === "USER_NEEDS_HELP" || check.status === "ESCALATED"
            ? "HELP"
            : "SC";
      const markerIcon = L.divIcon(createArgusDivIcon({
        kind: "force_report",
        severity,
        confidence: "reported",
        label,
        title: "Safety Check",
        active: check.status !== "USER_SAFE",
      }));
      const marker = L.marker([check.lastApproxLat, check.lastApproxLng], {
        icon: markerIcon,
        title: "Safety Check",
      }).addTo(safetyCheckLayer);
      marker.bindTooltip(`Safety Check · ${check.status}`, {
        direction: "top",
        offset: [0, -18],
        opacity: 0.94,
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
    visibleLiveCameras,
    visibleMedicalPoints,
    visibleQuakeSenseClusters,
    visibleSafetyChecks,
    visibleConflictZones,
    visibleConflictEvents,
    visibleNewsEvidence,
    selectedEventId,
    selectedVisualSourceId,
    selectedLiveCameraId,
    selectedExternalEventId,
    selectedConflictZoneId,
    onEventSelect,
    onExternalEventSelect,
    onVisualSourceSelect,
    onLiveCameraSelect,
    medicalAidRequest,
    onConflictZoneSelect,
    conflictZones,
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

  const exitGlobeMode = useCallback(() => {
    suppressGlobeModeRef.current = true;
    setIsGlobeMode(false);
    onViewModeChange?.("map");
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
  }, [onViewModeChange]);

  useEffect(() => {
    if (!viewMode) return;
    if (viewMode === "orbit") {
      setIsGlobeMode(true);
      return;
    }
    if (isGlobeMode) {
      exitGlobeMode();
      return;
    }
    if (mapRef.current) {
      suppressGlobeModeRef.current = true;
      mapRef.current.invalidateSize(false);
    }
  }, [exitGlobeMode, isGlobeMode, viewMode]);

  return (
    <div
      className={`argus-map-canvas argus-map-${baseMapType} relative h-full min-h-80 w-full overflow-hidden rounded-lg border border-white/10 bg-slate-950/50 shadow-2xl shadow-black/40 ${
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
              map={mapReady ? mapInstance : null}
              leaflet={mapReady ? leafletInstance : null}
            />
            <RouteLayerOverlay
              routes={routes}
              visibleTypes={visibleRouteTypes}
              map={mapReady ? mapInstance : null}
              leaflet={mapReady ? leafletInstance : null}
            />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-slate-950/90 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-950/90 to-transparent" />
          </>
        }
        globe={
          <GlobeView
            active={isGlobeMode}
            className="argus-orbit-canvas"
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
