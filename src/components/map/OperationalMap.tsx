"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CrisisEvent } from "@/types/crisis";
import type { UserLocationStatus } from "@/types/crisis";
import type { VisualSource } from "@/types/visualSource";
import type { ArgusLiveCamera } from "@/types/liveCamera";
import type { RiskProjection } from "@/types/weatherRisk";
import type { ArgusRoute, BaseMapType, RouteType } from "@/types/map";
import type { ArgusNormalizedEvent } from "@/types/ingestion";
import type { ArgusEvent } from "@/types/argusEvent";
import type { MedicalAidRequest, MedicalPoint } from "@/types/medical";
import type { MapEntity } from "@/types/mapEntity";
import type {
  ConflictCoordinates,
  ConflictEvent,
  ConflictZone,
} from "@/types/conflictZone";
import type { NewsEvidence } from "@/types/newsEvidence";
import type { SafetyCheck } from "@/types/mobileSafety";
import type { QuakeSenseCluster } from "@/types/quakesense";
import { clusterEventsByGrid } from "@/lib/simpleEventClustering";
import { isVisibleAtZoom, resolveClusterCellSizeDeg } from "@/lib/map/argusZoomVisibility";
import GlobeView from "@/components/map/GlobeView";
import MapToGlobeTransition from "@/components/map/MapToGlobeTransition";
import RiskProjectionOverlay from "@/components/map/RiskProjectionOverlay";
import ArgusEventLayer from "@/components/map/ArgusEventLayer";
import RouteLayerOverlay from "@/components/map/RouteLayerOverlay";
import AuraMedicalRouteOverlay from "@/components/map/AuraMedicalRouteOverlay";
import NavigationRouteOverlay from "@/components/map/NavigationRouteOverlay";
import PoiLayer from "@/components/map/PoiLayer";
import type { PoiEntity } from "@/lib/pois/poiTypes";
import CriticalPoiLayer from "@/components/map/CriticalPoiLayer";
import type { CriticalPoi } from "@/lib/criticalPoi/criticalPoiTypes";
import type { ShelterMapFilterState } from "@/lib/criticalPoi/shelterMapFilters";
import type { GeoPoint, RouteResult } from "@/lib/routing/routingService";
import {
  createArgusDivIcon,
  type ArgusMapConfidence,
  type ArgusMapEventKind,
  type ArgusMapSeverity,
} from "@/lib/mapSymbols/argusMapSymbols";
import { getBaseMapStyle } from "@/lib/map/baseMapStyles";

interface MapLayerSettings {
  reports: boolean;
  missingPersons?: boolean;
  demoReports?: boolean;
  usgsEarthquakes?: boolean;
  usgsShakeMapIntensity?: boolean;
  usgsPagerImpactAssessment?: boolean;
  gdacsAlerts?: boolean;
  noaaTsunami?: boolean;
  nasaFirms?: boolean;
  nasaEonet?: boolean;
  nwsWeatherAlerts?: boolean;
  openMeteoWeatherContext?: boolean;
  openAqAirQualityObservations?: boolean;
  usgsWaterConditions?: boolean;
  smithsonianGvpVolcanoes?: boolean;
  smithsonianGvpEruptionHistory?: boolean;
  smithsonianUsgsVolcanicActivityReports?: boolean;
  noaaCoopsCoastalObservations?: boolean;
  noaaStormEventsHistorical?: boolean;
  noaaNceiHistoricalTsunamis?: boolean;
  openFemaDisasterDeclarations?: boolean;
  hdxHapiHumanitarianContext?: boolean;
  whoDiseaseOutbreakNews?: boolean;
  ecdcPublicHealthThreats?: boolean;
  gdeltMediaSignals?: boolean;
  copernicusGlofasFloodForecast?: boolean;
  copernicusGfmObservedFloodExtent?: boolean;
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
  shelters?: boolean;
  urbanPois?: boolean;
  criticalPois?: boolean;
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
  argusOfficialAlerts?: boolean;
  argusSevereWeather?: boolean;
  argusLandslideFlood?: boolean;
  argusRoadDisruption?: boolean;
  argusNewsEvidence?: boolean;
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
  selectedMedicalPointId?: string;
  onMedicalPointSelect?: (point: MedicalPoint) => void;
  shelters?: MapEntity[];
  selectedShelterId?: string;
  onShelterSelect?: (entity: MapEntity) => void;
  selectedPoiId?: string | null;
  onPoiSelect?: (poi: PoiEntity) => void;
  selectedCriticalPoiId?: string | null;
  onCriticalPoiSelect?: (poi: CriticalPoi) => void;
  shelterFilter?: ShelterMapFilterState;
  auraMedicalRoute?: RouteResult | null;
  navigation?: {
    routes: RouteResult[];
    selectedRouteId: string | null;
    currentPosition: GeoPoint | null;
    destination: GeoPoint | null;
  } | null;
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
  argusEvents?: ArgusEvent[];
  selectedArgusEventId?: string | null;
  onArgusEventSelect?: (event: ArgusEvent) => void;
  baseMapType?: BaseMapType;
  centerOnSelected?: boolean;
  centerRequestKey?: number;
  focusTarget?: { latitude: number; longitude: number; key: number } | null;
  viewMode?: "map" | "orbit";
  onViewModeChange?: (mode: "map" | "orbit") => void;
}

const DEFAULT_CENTER: [number, number] = [-33.4489, -70.6693];
const GLOBE_ZOOM_THRESHOLD = 2;
const RETURN_FROM_GLOBE_ZOOM = GLOBE_ZOOM_THRESHOLD + 1;

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
  const category = event.category?.toLowerCase() ?? "";
  if (event.type === "SOS") return "force_report";
  if (category === "missing_person") return "force_report";
  if (event.type === "REPORT") return "citizen_report";
  if (
    category.includes("tornado") ||
    category.includes("tromba") ||
    category.includes("waterspout") ||
    category.includes("viento extremo") ||
    category.includes("severe_wind")
  ) {
    return "tornado";
  }
  if (
    category.includes("colapso") ||
    category.includes("collapse") ||
    category.includes("derrumbe")
  ) {
    return "structural_collapse";
  }
  if (category.includes("fire")) return "fire";
  if (category.includes("weather")) return "weather";
  return "risk_assessment";
};

const getEventMarkerLabel = (event: CrisisEvent): string => {
  if (event.category?.toLowerCase() === "missing_person") return "MP";
  if (event.type === "SOS") return "SOS";
  if (event.type === "ALERT") return "A";
  return "R";
};

const getExternalEventKind = (event: ArgusNormalizedEvent): ArgusMapEventKind => {
  // Checked before any sourceId-based fallback (e.g. `sourceId === "nws"`
  // below, which would otherwise flatten every NWS alert — tornado included
  // — into the generic "weather" marker).
  if (event.category === "tornado" || event.category === "waterspout" || event.category === "severe_wind") {
    return "tornado";
  }
  if (
    event.category === "structural_collapse" ||
    event.category === "roof_collapse" ||
    event.category === "building_collapse"
  ) {
    return "structural_collapse";
  }
  if (event.sourceId === "usgs_earthquake" || event.category === "earthquake") {
    return "earthquake";
  }
  if (event.sourceId === "noaa_tsunami" || event.category === "tsunami") {
    return "tsunami";
  }
  if (event.sourceId === "noaa-ncei-tsunami") {
    return "tsunami";
  }
  if (event.sourceId === "nws" || event.category === "weather_alert") {
    return "weather";
  }
  if (
    event.sourceId === "nasa-eonet" ||
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
  if (event.sourceId === "usgs_earthquake" || event.sourceId === "noaa_tsunami" || event.sourceId === "noaa-ncei-tsunami") {
    return "official";
  }
  if (event.sourceId === "gdacs") return "multi_source";
  if (event.sourceId === "nasa-eonet") return "official";
  if (event.sourceId === "nws") return "official";
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
  selectedMedicalPointId,
  onMedicalPointSelect,
  shelters = [],
  selectedShelterId,
  onShelterSelect,
  selectedPoiId = null,
  onPoiSelect,
  selectedCriticalPoiId = null,
  onCriticalPoiSelect,
  shelterFilter,
  auraMedicalRoute = null,
  navigation = null,
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
  argusEvents = [],
  selectedArgusEventId = null,
  onArgusEventSelect,
  baseMapType = "streets",
  centerOnSelected = true,
  centerRequestKey = 0,
  focusTarget = null,
  viewMode,
  onViewModeChange,
}: Props) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const initialBaseMapTypeRef = useRef(baseMapType);
  const baseTileLayerRef = useRef<import("leaflet").TileLayer | null>(null);
  const baseLabelsOverlayRef = useRef<import("leaflet").TileLayer | null>(null);
  const eventLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const demoEventLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const externalEventLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const visualSourceLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const liveCameraLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const medicalLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const shelterLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
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
  const lastGlobeCenterRef = useRef<{ lat: number; lng: number }>({
    lat: DEFAULT_CENTER[0],
    lng: DEFAULT_CENTER[1],
  });
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [isGlobeMode, setIsGlobeMode] = useState(false);
  const [globeInitialCenter, setGlobeInitialCenter] = useState(() => ({
    lat: DEFAULT_CENTER[0],
    lng: DEFAULT_CENTER[1],
  }));
  const [mapInstance, setMapInstance] = useState<import("leaflet").Map | null>(null);
  const [leafletInstance, setLeafletInstance] =
    useState<typeof import("leaflet") | null>(null);
  /** Drives progressive disclosure/LOD — see `@/lib/map/argusZoomVisibility`. */
  const [zoom, setZoom] = useState(11.2);

  const activateGlobeMode = useCallback(() => {
    const [lat, lng] = lastUsefulMapViewRef.current.center;
    setGlobeInitialCenter({ lat, lng });
    setIsGlobeMode(true);
  }, []);

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
  /**
   * Priority 1 ("incidentes y alertas activas") stays visible at every zoom
   * — it's density-clustered instead of hidden, and the grid cell shrinks as
   * the user zooms in so clusters break apart into individual reports
   * naturally (see `resolveClusterCellSizeDeg`).
   */
  const eventClusters = useMemo(
    () => clusterEventsByGrid(visibleEvents, resolveClusterCellSizeDeg(zoom)),
    [visibleEvents, zoom]
  );
  const demoEventClusters = useMemo(
    () => clusterEventsByGrid(visibleDemoEvents, resolveClusterCellSizeDeg(zoom)),
    [visibleDemoEvents, zoom]
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
      const lat = Number(point.lat);
      const lng = Number(point.lng);
      return Number.isFinite(lat) && Number.isFinite(lng);
    });
  }, [layerSettings.medicalPoints, medicalPoints]);
  const visibleShelters = useMemo(() => {
    if (!layerSettings.shelters) return [];

    return shelters.filter((entity) => Number.isFinite(entity.lat) && Number.isFinite(entity.lng));
  }, [layerSettings.shelters, shelters]);
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
          (event.sourceId === "nasa_firms" && layerSettings.nasaFirms) ||
          (event.sourceId === "nasa-eonet" && layerSettings.nasaEonet) ||
          (event.sourceId === "nws" && layerSettings.nwsWeatherAlerts) ||
          (event.sourceId === "noaa-storm-events" && layerSettings.noaaStormEventsHistorical) ||
          (event.sourceId === "noaa-ncei-tsunami" && layerSettings.noaaNceiHistoricalTsunamis) ||
          (event.sourceId === "openfema" && layerSettings.openFemaDisasterDeclarations)
      ),
    [
      externalEvents,
      layerSettings.gdacsAlerts,
      layerSettings.nasaFirms,
      layerSettings.nasaEonet,
      layerSettings.nwsWeatherAlerts,
      layerSettings.noaaStormEventsHistorical,
      layerSettings.noaaNceiHistoricalTsunamis,
      layerSettings.openFemaDisasterDeclarations,
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
  // Conflict/risk polygons (`visibleConflictZones`) stay visible at every
  // zoom — the individual attack-point and news markers below are secondary
  // detail on top of that zone, gated to zoom >= 10 (`incident_point` /
  // `news_evidence`) so a war-zone view isn't a wall of pins from far away.
  const visibleConflictEvents = useMemo(
    () =>
      layerSettings.conflictEvents && isVisibleAtZoom("incident_point", zoom)
        ? conflictEvents
        : [],
    [conflictEvents, layerSettings.conflictEvents, zoom]
  );
  const visibleNewsEvidence = useMemo(
    () =>
      layerSettings.crisisNews && isVisibleAtZoom("news_evidence", zoom)
        ? newsEvidence.filter(
            (item) => typeof item.lat === "number" && typeof item.lng === "number"
          )
        : [],
    [layerSettings.crisisNews, newsEvidence, zoom]
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

        const style = getBaseMapStyle(initialBaseMapTypeRef.current);
        baseTileLayerRef.current = L.tileLayer(style.base.url, {
          attribution: style.base.attribution,
          maxZoom: style.base.maxZoom,
        }).addTo(map);
        if (style.labelsOverlay) {
          baseLabelsOverlayRef.current = L.tileLayer(style.labelsOverlay.url, {
            attribution: style.labelsOverlay.attribution,
            maxZoom: style.labelsOverlay.maxZoom,
          }).addTo(map);
        }
        const tilePane = map.getPane("tilePane");
        if (tilePane) tilePane.style.filter = style.cssFilter ?? "";
        L.control.zoom({ position: "bottomleft" }).addTo(map);

        eventLayerRef.current = L.layerGroup().addTo(map);
        demoEventLayerRef.current = L.layerGroup().addTo(map);
        externalEventLayerRef.current = L.layerGroup().addTo(map);
        visualSourceLayerRef.current = L.layerGroup().addTo(map);
        liveCameraLayerRef.current = L.layerGroup().addTo(map);
        medicalLayerRef.current = L.layerGroup().addTo(map);
        shelterLayerRef.current = L.layerGroup().addTo(map);
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
        if (shouldStartInOrbit) {
          activateGlobeMode();
        } else {
          setIsGlobeMode(false);
        }

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
          activateGlobeMode();
          onViewModeChangeRef.current?.("orbit");
        };
        map.on("zoomstart", rememberUsefulView);
        map.on("movestart", rememberUsefulView);
        map.on("zoomend", handleZoomEnd);

        const handleZoomLevelChange = () => setZoom(map.getZoom());
        handleZoomLevelChange();
        map.on("zoomend", handleZoomLevelChange);

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
      baseTileLayerRef.current = null;
      baseLabelsOverlayRef.current = null;
      eventLayerRef.current = null;
      demoEventLayerRef.current = null;
      externalEventLayerRef.current = null;
      visualSourceLayerRef.current = null;
      liveCameraLayerRef.current = null;
      medicalLayerRef.current = null;
      shelterLayerRef.current = null;
      quakeSenseLayerRef.current = null;
      safetyCheckLayerRef.current = null;
      conflictZoneLayerRef.current = null;
      conflictEventLayerRef.current = null;
      newsEvidenceLayerRef.current = null;
      userLayerRef.current = null;
    };
  }, [activateGlobeMode]);

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
    const shelterLayer = shelterLayerRef.current;
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
      !shelterLayer ||
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
    shelterLayer?.clearLayers();
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
        // A bbox is only ever an approximate area of interest, never a real
        // administrative/front-line boundary — rendering it as a filled
        // rectangle would imply false precision. Show it as a marker at the
        // bbox center instead (bbox is still available for fitBounds/framing
        // elsewhere); same treatment as the `point` branch below.
        const center: [number, number] = [
          (zone.coordinates.south + zone.coordinates.north) / 2,
          (zone.coordinates.west + zone.coordinates.east) / 2,
        ];
        const markerIcon = L.divIcon(createArgusDivIcon({
          kind: "risk_assessment",
          severity: toMapSeverity(zone.riskLevel),
          confidence: zone.confidence === "high" ? "verified" : zone.confidence === "medium" ? "reported" : "raw",
          label: "CZ",
          title: zone.name,
          active: true,
          selected: zone.id === selectedConflictZoneId,
        }));
        layer = L.marker(center, {
          icon: markerIcon,
          title: zone.name,
        }).addTo(conflictZoneLayer);
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

    // Priority 1 ("incidentes y alertas activas") never disappears — grid
    // clustering (zoom-aware cell size) keeps it clean far away and
    // naturally breaks apart into individual reports up close instead of a
    // hard zoom cutoff. See `eventClusters` / `resolveClusterCellSizeDeg`.
    eventClusters.forEach((cluster) => {
      const primaryEvent = cluster.events[0];
      if (!primaryEvent) return;

      if (cluster.count === 1) {
        const iconDefinition = createArgusDivIcon({
          kind: getInternalEventKind(primaryEvent),
          severity: toMapSeverity(primaryEvent.severity),
          confidence: primaryEvent.type === "REPORT" ? "reported" : "verified",
          label: getEventMarkerLabel(primaryEvent),
          title: primaryEvent.title,
          active: primaryEvent.status !== "RESOLVED",
          selected: primaryEvent.id === selectedEventId,
        });
        const marker = L.marker([primaryEvent.latitude, primaryEvent.longitude], {
          icon: L.divIcon(iconDefinition),
        }).addTo(eventLayer);

        marker.on("click", () => {
          onEventSelect?.(primaryEvent);
        });
        return;
      }

      const clusterIcon = L.divIcon(createArgusDivIcon({
        kind: getInternalEventKind(primaryEvent),
        severity: toMapSeverity(cluster.highestSeverity),
        confidence: "reported",
        label: String(cluster.count),
        title: `${cluster.count} reportes`,
        active: cluster.highestSeverity === "CRITICAL" || cluster.highestSeverity === "HIGH",
        selected: cluster.events.some((event) => event.id === selectedEventId),
      }));
      const marker = L.marker([cluster.latitude, cluster.longitude], {
        icon: clusterIcon,
        title: `${cluster.count} reportes`,
      }).addTo(eventLayer);
      marker.bindTooltip(
        `${cluster.count} reportes · prioridad ${cluster.priorityScore} · ${cluster.highestSeverity}`,
        { direction: "top", offset: [0, -18], opacity: 0.95 }
      );
      marker.on("click", () => {
        onEventSelect?.(primaryEvent);
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
                : event.sourceId === "nasa-eonet"
                  ? "EO"
                : event.sourceId === "nws"
                  ? "NWS"
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
      const isSelected = point.id === selectedMedicalPointId;
      const markerIcon = L.divIcon(createArgusDivIcon({
        kind: "official_source",
        severity: point.availabilityStatus === "available" ? "info" : "medium",
        confidence: point.isDemo ? "reported" : "official",
        label: "MED",
        title: point.name,
        active: point.availabilityStatus !== "closed",
        selected: isSelected,
      }));
      const marker = L.marker([point.lat, point.lng], {
        icon: markerIcon,
        title: point.name,
      }).addTo(medicalLayer);
      marker.bindTooltip(`${point.name} - ${point.type}`, {
        direction: "top",
        offset: [0, -18],
        opacity: 0.92,
      });
      marker.on("click", () => onMedicalPointSelect?.(point));
    });

    visibleShelters.forEach((entity) => {
      const isSelected = entity.id === selectedShelterId;
      const markerIcon = L.divIcon(createArgusDivIcon({
        kind: "official_source",
        severity: entity.status === "limited" ? "medium" : "info",
        confidence: entity.isDemo ? "reported" : "official",
        label: "REF",
        title: entity.name,
        active: entity.status !== "closed",
        selected: isSelected,
      }));
      const marker = L.marker([entity.lat, entity.lng], {
        icon: markerIcon,
        title: entity.name,
      }).addTo(shelterLayer);
      marker.bindTooltip(entity.name, {
        direction: "top",
        offset: [0, -18],
        opacity: 0.92,
      });
      marker.on("click", () => onShelterSelect?.(entity));
    });

    if (medicalAidRequest) {
      const markerIcon = L.divIcon(createArgusDivIcon({
        kind: "force_report",
        severity: toMapSeverity(medicalAidRequest.severity),
        confidence: "reported",
        label: "SOS",
        title: "SOS Médico",
        active: medicalAidRequest.status !== "resolved",
      }));
      L.marker([medicalAidRequest.latitude, medicalAidRequest.longitude], {
        icon: markerIcon,
        title: "SOS Médico",
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
    eventClusters,
    visibleDemoEvents,
    demoEventClusters,
    externalEvents,
    visibleExternalEvents,
    visibleVisualSources,
    visibleLiveCameras,
    visibleMedicalPoints,
    visibleShelters,
    selectedShelterId,
    onShelterSelect,
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
    selectedMedicalPointId,
    onMedicalPointSelect,
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

  useEffect(() => {
    if (!mapReady || !mapRef.current || !focusTarget) return;
    const lat = Number(focusTarget.latitude);
    const lng = Number(focusTarget.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    suppressGlobeModeRef.current = true;
    window.requestAnimationFrame(() => {
      setIsGlobeMode(false);
      onViewModeChange?.("map");
    });
    mapRef.current.flyTo([lat, lng], 13, { duration: 0.7 });
  }, [focusTarget, mapReady, onViewModeChange]);

  const exitGlobeMode = useCallback((view?: {
    center?: { lat: number; lng: number };
    zoom?: number;
  }) => {
    suppressGlobeModeRef.current = true;
    setIsGlobeMode(false);
    onViewModeChange?.("map");
    if (!mapRef.current) {
      return;
    }
    const requestedCenter = view?.center ?? lastGlobeCenterRef.current;
    const lat = Number(requestedCenter.lat);
    const lng = Number(requestedCenter.lng);
    const returnCenter: [number, number] =
      Number.isFinite(lat) && Number.isFinite(lng)
        ? [lat, lng]
        : lastUsefulMapViewRef.current.center;
    const returnZoom = view?.zoom ?? RETURN_FROM_GLOBE_ZOOM;
    lastUsefulMapViewRef.current = {
      center: returnCenter,
      zoom: returnZoom,
    };
    mapRef.current.setView(returnCenter, returnZoom, {
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
      activateGlobeMode();
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
  }, [activateGlobeMode, exitGlobeMode, isGlobeMode, viewMode]);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!mapReady || !map || !L) return;

    if (baseTileLayerRef.current) {
      map.removeLayer(baseTileLayerRef.current);
    }
    if (baseLabelsOverlayRef.current) {
      map.removeLayer(baseLabelsOverlayRef.current);
      baseLabelsOverlayRef.current = null;
    }

    const style = getBaseMapStyle(baseMapType);
    baseTileLayerRef.current = L.tileLayer(style.base.url, {
      attribution: style.base.attribution,
      maxZoom: style.base.maxZoom,
    }).addTo(map);
    baseTileLayerRef.current.bringToBack();
    if (style.labelsOverlay) {
      baseLabelsOverlayRef.current = L.tileLayer(style.labelsOverlay.url, {
        attribution: style.labelsOverlay.attribution,
        maxZoom: style.labelsOverlay.maxZoom,
      }).addTo(map);
    }
    const tilePane = map.getPane("tilePane");
    if (tilePane) tilePane.style.filter = style.cssFilter ?? "";
  }, [baseMapType, mapReady]);

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
            <ArgusEventLayer
              events={argusEvents}
              visibility={{
                argusOfficialAlerts: Boolean(layerSettings.argusOfficialAlerts),
                argusSevereWeather: Boolean(layerSettings.argusSevereWeather),
                argusLandslideFlood: Boolean(layerSettings.argusLandslideFlood),
                argusRoadDisruption: Boolean(layerSettings.argusRoadDisruption),
                argusNewsEvidence: Boolean(layerSettings.argusNewsEvidence),
              }}
              selectedEventId={selectedArgusEventId}
              onEventSelect={onArgusEventSelect}
              zoom={zoom}
              map={mapReady ? mapInstance : null}
              leaflet={mapReady ? leafletInstance : null}
            />
            <PoiLayer
              visible={Boolean(layerSettings.urbanPois)}
              selectedPoiId={selectedPoiId}
              onPoiSelect={onPoiSelect}
              map={mapReady ? mapInstance : null}
              leaflet={mapReady ? leafletInstance : null}
            />
            <CriticalPoiLayer
              visible={layerSettings.criticalPois !== false}
              selectedPoiId={selectedCriticalPoiId}
              onPoiSelect={onCriticalPoiSelect}
              shelterFilter={shelterFilter}
              map={mapReady ? mapInstance : null}
              leaflet={mapReady ? leafletInstance : null}
            />
            <RouteLayerOverlay
              routes={routes}
              visibleTypes={visibleRouteTypes}
              map={mapReady ? mapInstance : null}
              leaflet={mapReady ? leafletInstance : null}
            />
            <AuraMedicalRouteOverlay
              route={auraMedicalRoute}
              map={mapReady ? mapInstance : null}
              leaflet={mapReady ? leafletInstance : null}
            />
            {navigation && (
              <NavigationRouteOverlay
                routes={navigation.routes}
                selectedRouteId={navigation.selectedRouteId}
                currentPosition={navigation.currentPosition}
                destination={navigation.destination}
                map={mapReady ? mapInstance : null}
                leaflet={mapReady ? leafletInstance : null}
              />
            )}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-slate-950/90 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-950/90 to-transparent" />
            {layerSettings.openMeteoWeatherContext && (
              <div className="pointer-events-none absolute left-4 top-4 z-[60] max-w-xs border border-cyan-300/25 bg-slate-950/88 px-3 py-2 text-[0.62rem] uppercase tracking-[0.14em] text-cyan-100 shadow-lg shadow-black/30 backdrop-blur-xl">
                Open-Meteo Weather Context · overlay contextual · no alert source
              </div>
            )}
            {layerSettings.openAqAirQualityObservations && (
              <div className="pointer-events-none absolute left-4 top-16 z-[60] max-w-sm border border-emerald-300/25 bg-slate-950/88 px-3 py-2 text-[0.62rem] uppercase tracking-[0.14em] text-emerald-100 shadow-lg shadow-black/30 backdrop-blur-xl">
                OpenAQ Air Quality Observations - contextual - requires key/provider license - not incident source
              </div>
            )}
          </>
        }
        globe={
          <GlobeView
            active={isGlobeMode}
            className="argus-orbit-canvas"
            events={visibleEvents}
            demoEvents={visibleDemoEvents}
            externalEvents={visibleExternalEvents}
            argusEvents={argusEvents}
            initialCenter={globeInitialCenter}
            returnZoom={RETURN_FROM_GLOBE_ZOOM}
            onSelectEvent={onEventSelect}
            onSelectExternalEvent={onExternalEventSelect}
            onSelectArgusEvent={onArgusEventSelect}
            onCenterChange={(center) => {
              lastGlobeCenterRef.current = center;
            }}
            onExitGlobe={exitGlobeMode}
          />
        }
      />
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
