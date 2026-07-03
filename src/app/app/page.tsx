"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ArgusOperationalHUD from "@/components/map/ArgusOperationalHUD";
import MapLayerControls, {
  type LayerDisplayMeta,
} from "@/components/map/MapLayerControls";
import EventDetailPanel from "@/components/map/EventDetailPanel";
import ExternalEventPopup from "@/components/map/ExternalEventPopup";
import ExternalCorrelationsPanel from "@/components/map/ExternalCorrelationsPanel";
import VisualSourcePopup from "@/components/map/VisualSourcePopup";
import WindLayerLegend from "@/components/map/WindLayerLegend";
import LiveCameraList from "@/components/live-cameras/LiveCameraList";
import LiveCameraPanel from "@/components/live-cameras/LiveCameraPanel";
import RiskAssessmentPanel from "@/components/risk/RiskAssessmentPanel";
import ConflictLegend from "@/components/conflict/ConflictLegend";
import ConflictZonePanel from "@/components/conflict/ConflictZonePanel";
import ArgusModuleLauncher from "@/components/modules/ArgusModuleLauncher";
import AuraMedicalButton from "@/components/medical/AuraMedicalButton";
import AuraMedicalPanel from "@/components/medical/AuraMedicalPanel";
import FloatingSOSButton from "@/components/app/FloatingSOSButton";
import FloatingReportButton from "@/components/app/FloatingReportButton";
import NotificationCenterButton from "@/components/notifications/NotificationCenterButton";
import NotificationCenterPanel from "@/components/notifications/NotificationCenterPanel";
import NearbyEventsSheet from "@/components/app/NearbyEventsSheet";
import ReportModal from "@/components/app/ReportModal";
import HelpRequestModal from "@/components/app/HelpRequestModal";
import { useSession } from "@/hooks/useSession";
import { useUserLocation } from "@/hooks/useUserLocation";
import { demoVisualSources } from "@/data/demoVisualSources";
import { embeddableLiveCameraCount, liveCameras } from "@/data/liveCameras";
import { demoRoutes } from "@/data/demoRoutes";
import { demoCrisisEvents } from "@/data/generateDemoCrisisEvents";
import {
  curatedConflictEvents,
  curatedConflictZones,
  curatedNewsEvidence,
} from "@/data/conflictZones";
import { demoMedicalPoints } from "@/data/medicalPoints";
import {
  demoRiskProjections,
  demoWeatherObservations,
} from "@/data/demoWeatherRisk";
import {
  applyDemoVerification,
  enrichEventLifecycle,
} from "@/lib/alertLifecycle";
import {
  filterEventsByLifecycle,
  filterEventsBySeverity,
  filterEventsByType,
  limitVisibleEvents,
  sortEventsByPriority,
  type DemoLifecycleFilter,
  type DemoSeverityFilter,
  type DemoTypeFilter,
} from "@/lib/demoEventFilters";
import type {
  AlertVerificationAction,
  CrisisEvent,
} from "@/types/crisis";
import type { VisualSource } from "@/types/visualSource";
import type { ArgusLiveCamera } from "@/types/liveCamera";
import type {
  MetWeatherSourceResponse,
  RiskProjection,
  WeatherObservation,
} from "@/types/weatherRisk";
import type { BaseMapType } from "@/types/map";
import type {
  ArgusIngestionSourceResponse,
  ArgusNormalizedEvent,
} from "@/types/ingestion";
import type { ArgusIncidentKnowledge } from "@/types/knowledgeIntake";
import type { ArgusRiskAssessment } from "@/types/riskAssessment";
import type { ConflictZone } from "@/types/conflictZone";
import type { MedicalAidRequest } from "@/types/medical";
import type { SafetyCheck } from "@/types/mobileSafety";
import type { QuakeSenseCluster } from "@/types/quakesense";
import type {
  ArgusNotification,
  ArgusNotificationSummary,
} from "@/types/notificationCenter";
import { correlateExternalEvents } from "@/lib/ingestion/correlateExternalEvents";
import { getConflictProximityWarnings } from "@/lib/conflict/conflictRiskEngine";

const OperationalMap = dynamic(
  () => import("@/components/map/OperationalMap"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-80 w-full items-center justify-center bg-slate-950 text-sm text-cyan-100">
        Cargando mapa operacional...
      </div>
    ),
  }
);

const initialLayers = {
  reports: true,
  missingPersons: true,
  demoReports: false,
  usgsEarthquakes: false,
  gdacsAlerts: false,
  noaaTsunami: false,
  nasaFirms: false,
  nasaEonet: false,
  nwsWeatherAlerts: false,
  openMeteoWeatherContext: false,
  usgsWaterConditions: false,
  noaaCoopsCoastalObservations: false,
  noaaStormEventsHistorical: false,
  noaaNceiHistoricalTsunamis: false,
  openFemaDisasterDeclarations: false,
  reliefWeb: false,
  sos: true,
  alerts: true,
  critical: true,
  resolved: true,
  user: true,
  visualSources: true,
  officialSources: true,
  publicCameras: true,
  liveCameras: false,
  medicalPoints: false,
  quakeSense: false,
  safetyChecks: false,
  weatherRisk: true,
  terrestrialRoutes: true,
  airRoutes: true,
  maritimeRoutes: true,
  conflictZones: false,
  conflictEvents: false,
  territorialControl: false,
  crisisNews: false,
  confirmedDisasters: false,
};

const initialEventState: CrisisEvent[] = [];
const defaultVisibleWidgets = {
  hud: true,
  layers: true,
  weather: true,
  nearby: true,
  risk: false,
};

function eonetIncidentToExternalEvent(incident: ArgusIncidentKnowledge): ArgusNormalizedEvent {
  return {
    id: incident.id,
    sourceId: "nasa-eonet",
    sourceName: "NASA EONET",
    externalId: incident.id.replace(/^eonet-/, ""),
    title: incident.title,
    description: incident.summary,
    category: incident.domain as ArgusNormalizedEvent["category"],
    severity: incident.severity === "unknown" ? "low" : incident.severity,
    confidence: incident.confidenceScore,
    latitude: incident.latitude ?? null,
    longitude: incident.longitude ?? null,
    occurredAt: incident.occurredAt ?? incident.detectedAt ?? incident.createdAt,
    updatedAt: incident.updatedAt,
    url: incident.rawEvidenceRefs[0] ?? null,
    rawMagnitude: incident.technicalFactors.magnitudeValue ?? null,
    rawMagnitudeType: incident.technicalFactors.magnitudeUnit ?? null,
    locationName: [incident.locality, incident.region, incident.country].filter(Boolean).join(", ") || null,
    country: incident.country ?? null,
    recommendedAction: incident.recommendedActions[0]?.text ?? null,
    whyItMatters: "NASA EONET aporta contexto global de eventos naturales; no es una orden local ni activa rutas/evacuaciones oficiales por si solo.",
    isExternal: true,
  };
}

function nwsIncidentToExternalEvent(incident: ArgusIncidentKnowledge): ArgusNormalizedEvent {
  return {
    id: incident.id,
    sourceId: "nws",
    sourceName: incident.sourceNames[0] ?? "NWS / api.weather.gov",
    externalId: incident.id.replace(/^nws-/, ""),
    title: incident.title,
    description: incident.summary,
    category: incident.domain as ArgusNormalizedEvent["category"],
    severity: incident.severity === "unknown" ? "low" : incident.severity,
    confidence: incident.confidenceScore,
    latitude: incident.latitude ?? null,
    longitude: incident.longitude ?? null,
    occurredAt: incident.occurredAt ?? incident.detectedAt ?? incident.createdAt,
    updatedAt: incident.updatedAt,
    url: incident.rawEvidenceRefs.find((ref) => ref.startsWith("http")) ?? null,
    rawMagnitude: null,
    rawMagnitudeType: incident.technicalFactors.nwsSeverity ?? null,
    locationName: incident.locality ?? incident.region ?? "United States / NWS territories",
    country: incident.country ?? "US",
    recommendedAction: incident.recommendedActions[0]?.text ?? null,
    whyItMatters:
      "NWS aporta alertas meteorologicas oficiales para Estados Unidos y territorios NWS. Es contexto ARGUS prudente, no orden automatica ni cobertura meteorologica mundial.",
    isExternal: true,
  };
}

type VisibleWidgetKey = keyof typeof defaultVisibleWidgets;
type MapViewMode = "map" | "orbit";
type ActiveMobilePanel = VisibleWidgetKey | null;
const mobileExclusiveWidgets: VisibleWidgetKey[] = [
  "hud",
  "layers",
  "weather",
  "nearby",
  "risk",
];

function persistVisibleWidgets(widgets: typeof defaultVisibleWidgets) {
  try {
    window.localStorage.setItem("argus-visible-widgets", JSON.stringify(widgets));
  } catch {
    // Storage can be unavailable in Safari private mode.
  }
}

export default function AppPage() {
  const router = useRouter();
  const [displayMode, setDisplayMode] = useState<
    "command" | "map" | "layers"
  >(() => {
    if (typeof window === "undefined") return "command";
    try {
      const storedMode = window.localStorage.getItem("argus-display-mode");
      if (
        storedMode === "command" ||
        storedMode === "map" ||
        storedMode === "layers"
      ) {
        return storedMode;
      }
    } catch {
      return "command";
    }
    return "command";
  });
  const [mapViewMode, setMapViewMode] = useState<MapViewMode>("map");
  const [activeMobilePanel, setActiveMobilePanel] =
    useState<ActiveMobilePanel>("hud");
  const [visibleWidgets, setVisibleWidgets] = useState(() => {
    if (typeof window === "undefined") return defaultVisibleWidgets;
    try {
      const storedWidgets = window.localStorage.getItem("argus-visible-widgets");
      if (!storedWidgets) return defaultVisibleWidgets;
      const parsed = JSON.parse(storedWidgets) as Partial<
        typeof defaultVisibleWidgets
      >;
      return {
        ...defaultVisibleWidgets,
        ...Object.fromEntries(
          Object.entries(parsed).filter(([, value]) => typeof value === "boolean")
        ),
      };
    } catch {
      return defaultVisibleWidgets;
    }
  });
  const [centerRequestKey, setCenterRequestKey] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<CrisisEvent | null>(null);
  const [selectedVisualSource, setSelectedVisualSource] = useState<VisualSource | null>(null);
  const [selectedLiveCamera, setSelectedLiveCamera] =
    useState<ArgusLiveCamera | null>(null);
  const [selectedRiskProjection, setSelectedRiskProjection] = useState<RiskProjection | null>(
    demoRiskProjections[0] ?? null
  );
  const [selectedExternalEvent, setSelectedExternalEvent] =
    useState<ArgusNormalizedEvent | null>(null);
  const [selectedConflictZone, setSelectedConflictZone] =
    useState<ConflictZone | null>(null);
  const [events, setEvents] = useState<CrisisEvent[]>(initialEventState);
  const [demoEvents, setDemoEvents] = useState<CrisisEvent[]>(() => [...demoCrisisEvents]);
  const [layerSettings, setLayerSettings] = useState(initialLayers);
  const [baseMapType, setBaseMapType] = useState<BaseMapType>("tactical");
  const [demoSeverityFilter, setDemoSeverityFilter] =
    useState<DemoSeverityFilter>("ALL");
  const [demoTypeFilter, setDemoTypeFilter] = useState<DemoTypeFilter>("ALL");
  const [demoLifecycleFilter, setDemoLifecycleFilter] =
    useState<DemoLifecycleFilter>("ALL");
  const [usgsEvents, setUsgsEvents] = useState<ArgusNormalizedEvent[]>([]);
  const [usgsStatus, setUsgsStatus] = useState<
    "idle" | "loading" | "loaded" | "error"
  >("idle");
  const [usgsErrorMessage, setUsgsErrorMessage] = useState<string | null>(null);
  const [usgsUpdatedAt, setUsgsUpdatedAt] = useState<string | null>(null);
  const [usgsExpiresAt, setUsgsExpiresAt] = useState<string | null>(null);
  const [usgsCached, setUsgsCached] = useState(false);
  const [usgsRetryVersion, setUsgsRetryVersion] = useState(0);
  const usgsFetchStartedRef = useRef(false);
  const [gdacsEvents, setGdacsEvents] = useState<ArgusNormalizedEvent[]>([]);
  const [gdacsStatus, setGdacsStatus] = useState<
    "idle" | "loading" | "loaded" | "error"
  >("idle");
  const [gdacsErrorMessage, setGdacsErrorMessage] = useState<string | null>(null);
  const [gdacsUpdatedAt, setGdacsUpdatedAt] = useState<string | null>(null);
  const [gdacsExpiresAt, setGdacsExpiresAt] = useState<string | null>(null);
  const [gdacsCached, setGdacsCached] = useState(false);
  const [gdacsRetryVersion, setGdacsRetryVersion] = useState(0);
  const gdacsFetchStartedRef = useRef(false);
  const [noaaEvents, setNoaaEvents] = useState<ArgusNormalizedEvent[]>([]);
  const [noaaStatus, setNoaaStatus] = useState<
    "idle" | "loading" | "loaded" | "error"
  >("idle");
  const [noaaErrorMessage, setNoaaErrorMessage] = useState<string | null>(null);
  const [noaaUpdatedAt, setNoaaUpdatedAt] = useState<string | null>(null);
  const [noaaExpiresAt, setNoaaExpiresAt] = useState<string | null>(null);
  const [noaaCached, setNoaaCached] = useState(false);
  const [noaaRetryVersion, setNoaaRetryVersion] = useState(0);
  const noaaFetchStartedRef = useRef(false);
  const [nasaEvents, setNasaEvents] = useState<ArgusNormalizedEvent[]>([]);
  const [nasaStatus, setNasaStatus] = useState<
    "idle" | "loading" | "loaded" | "error"
  >("idle");
  const [nasaErrorMessage, setNasaErrorMessage] = useState<string | null>(null);
  const [nasaCached, setNasaCached] = useState(false);
  const [nasaConfigured, setNasaConfigured] = useState<boolean | null>(null);
  const [nasaConfigError, setNasaConfigError] = useState(false);
  const [nasaRetryVersion, setNasaRetryVersion] = useState(0);
  const nasaFetchStartedRef = useRef(false);
  const [eonetEvents, setEonetEvents] = useState<ArgusNormalizedEvent[]>([]);
  const [eonetStatus, setEonetStatus] = useState<
    "idle" | "loading" | "loaded" | "error"
  >("idle");
  const [eonetErrorMessage, setEonetErrorMessage] = useState<string | null>(null);
  const [eonetRetryVersion, setEonetRetryVersion] = useState(0);
  const eonetFetchStartedRef = useRef(false);
  const [nwsEvents, setNwsEvents] = useState<ArgusNormalizedEvent[]>([]);
  const [nwsStatus, setNwsStatus] = useState<
    "idle" | "loading" | "loaded" | "error"
  >("idle");
  const [nwsErrorMessage, setNwsErrorMessage] = useState<string | null>(null);
  const [nwsUserAgentConfigured, setNwsUserAgentConfigured] = useState<boolean | null>(null);
  const [nwsRetryVersion, setNwsRetryVersion] = useState(0);
  const nwsFetchStartedRef = useRef(false);
  const [reliefWebEvents, setReliefWebEvents] = useState<
    ArgusNormalizedEvent[]
  >([]);
  const [reliefWebStatus, setReliefWebStatus] = useState<
    "idle" | "loading" | "loaded" | "error"
  >("idle");
  const [, setReliefWebErrorMessage] = useState<
    string | null
  >(null);
  const [reliefWebCached, setReliefWebCached] = useState(false);
  const [reliefWebConfigured, setReliefWebConfigured] = useState<
    boolean | null
  >(null);
  const [reliefWebRetryVersion] = useState(0);
  const reliefWebFetchStartedRef = useRef(false);
  const [metWeather, setMetWeather] = useState<WeatherObservation | null>(null);
  const [metStatus, setMetStatus] = useState<
    "idle" | "loading" | "loaded" | "error"
  >("idle");
  const [metErrorMessage, setMetErrorMessage] = useState<string | null>(null);
  const [metCached, setMetCached] = useState(false);
  const [metRetryVersion, setMetRetryVersion] = useState(0);
  const [riskAssessments, setRiskAssessments] = useState<ArgusRiskAssessment[]>([]);
  const [riskStatus, setRiskStatus] = useState<
    "idle" | "loading" | "loaded" | "error"
  >("idle");
  const [riskErrorMessage, setRiskErrorMessage] = useState<string | null>(null);
  const [riskRefreshVersion, setRiskRefreshVersion] = useState(0);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isAuraOpen, setIsAuraOpen] = useState(false);
  const [isNotificationCenterOpen, setIsNotificationCenterOpen] = useState(false);
  const [notificationSummary, setNotificationSummary] =
    useState<ArgusNotificationSummary | null>(null);
  const [notificationFocusTarget, setNotificationFocusTarget] = useState<{
    latitude: number;
    longitude: number;
    key: number;
  } | null>(null);
  const [medicalAidRequest, setMedicalAidRequest] =
    useState<MedicalAidRequest | null>(null);
  const [quakeSenseClusters, setQuakeSenseClusters] = useState<
    QuakeSenseCluster[]
  >([]);
  const [safetyChecks, setSafetyChecks] = useState<SafetyCheck[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const location = useUserLocation();
  const { user: sessionUser, loading: sessionLoading } = useSession();

  const canReport = Boolean(sessionUser && !["LIMITED", "SUSPENDED", "BANNED"].includes(sessionUser.accountStatus));
  const canSOS = Boolean(sessionUser);

  useEffect(() => {
    if (!sessionLoading && sessionUser?.profileCompletionRequired) {
      router.replace("/onboarding?next=/app");
    }
  }, [router, sessionLoading, sessionUser?.profileCompletionRequired]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const mediaQuery = window.matchMedia("(max-width: 639px)");
    const updateViewport = () => setIsMobileViewport(mediaQuery.matches);

    updateViewport();
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", updateViewport);
      return () => mediaQuery.removeEventListener("change", updateViewport);
    }
    mediaQuery.addListener(updateViewport);
    return () => mediaQuery.removeListener(updateViewport);
  }, []);

  useEffect(() => {
    if (!isMobileViewport) return;

    setVisibleWidgets((current) => {
      const activePanels = mobileExclusiveWidgets.filter((key) => current[key]);
      if (activePanels.length <= 1) return current;

      const activePanel = activeMobilePanel ?? activePanels[0] ?? null;
      const next = {
        ...current,
        hud: activePanel === "hud",
        layers: activePanel === "layers",
        weather: activePanel === "weather",
        nearby: activePanel === "nearby",
        risk: activePanel === "risk",
      };
      persistVisibleWidgets(next);
      return next;
    });
  }, [activeMobilePanel, isMobileViewport]);

  const changeDisplayMode = useCallback(
    (mode: "command" | "map" | "layers") => {
      setDisplayMode(mode);
      if (mode === "map") {
        setMapViewMode("map");
        setActiveMobilePanel(null);
        setVisibleWidgets((current) => {
          const next = {
            ...current,
            hud: !isMobileViewport,
            layers: false,
            weather: false,
            nearby: false,
            risk: false,
          };
          persistVisibleWidgets(next);
          return next;
        });
      } else if (mode === "layers" && isMobileViewport) {
        setMapViewMode("map");
        setActiveMobilePanel("layers");
        setVisibleWidgets((current) => {
          const next = {
            ...current,
            hud: false,
            layers: true,
            weather: false,
            nearby: false,
            risk: false,
          };
          persistVisibleWidgets(next);
          return next;
        });
      }
      try {
        window.localStorage.setItem("argus-display-mode", mode);
      } catch {
        // Storage can be unavailable in Safari private mode.
      }
    },
    [isMobileViewport]
  );

  const setWidgetVisibility = useCallback(
    (key: VisibleWidgetKey, visible: boolean) => {
      if (isMobileViewport && mobileExclusiveWidgets.includes(key)) {
        setActiveMobilePanel(visible ? key : null);
      }
      setVisibleWidgets((current) => {
        const next = { ...current, [key]: visible };
        if (
          isMobileViewport &&
          visible &&
          mobileExclusiveWidgets.includes(key)
        ) {
          mobileExclusiveWidgets.forEach((widgetKey) => {
            if (widgetKey !== key) next[widgetKey] = false;
          });
        }
        persistVisibleWidgets(next);
        return next;
      });
    },
    [isMobileViewport]
  );

  const enterOrbitMode = useCallback(() => {
    setDisplayMode("map");
    setMapViewMode("orbit");
    setActiveMobilePanel(null);
    setVisibleWidgets((current) => {
      const next = {
        ...current,
        hud: !isMobileViewport,
        layers: false,
        weather: false,
        nearby: false,
        risk: false,
      };
      persistVisibleWidgets(next);
      return next;
    });
  }, [isMobileViewport]);

  const collapseSecondaryPanels = useCallback(() => {
    setActiveMobilePanel(null);
    setVisibleWidgets((current) => {
      const next = {
        ...current,
        layers: false,
        weather: false,
        nearby: false,
        risk: false,
      };
      persistVisibleWidgets(next);
      return next;
    });
  }, []);

  const selectEvent = useCallback((event: CrisisEvent) => {
    setSelectedVisualSource(null);
    setSelectedLiveCamera(null);
    setSelectedRiskProjection(null);
    setSelectedExternalEvent(null);
    setSelectedConflictZone(null);
    setSelectedEvent(event);
  }, []);

  const selectVisualSource = useCallback((source: VisualSource) => {
    setSelectedEvent(null);
    setSelectedLiveCamera(null);
    setSelectedRiskProjection(null);
    setSelectedExternalEvent(null);
    setSelectedConflictZone(null);
    setSelectedVisualSource(source);
  }, []);

  const selectLiveCamera = useCallback((camera: ArgusLiveCamera) => {
    setSelectedEvent(null);
    setSelectedVisualSource(null);
    setSelectedRiskProjection(null);
    setSelectedExternalEvent(null);
    setSelectedConflictZone(null);
    setSelectedLiveCamera(camera);
  }, []);

  const selectRiskProjection = useCallback((projection: RiskProjection) => {
    setSelectedEvent(null);
    setSelectedVisualSource(null);
    setSelectedLiveCamera(null);
    setSelectedExternalEvent(null);
    setSelectedConflictZone(null);
    setSelectedRiskProjection(projection);
  }, []);

  const selectExternalEvent = useCallback((event: ArgusNormalizedEvent) => {
    setSelectedEvent(null);
    setSelectedVisualSource(null);
    setSelectedLiveCamera(null);
    setSelectedRiskProjection(null);
    setSelectedConflictZone(null);
    setSelectedExternalEvent(event);
  }, []);

  const selectConflictZone = useCallback((zone: ConflictZone) => {
    setSelectedEvent(null);
    setSelectedVisualSource(null);
    setSelectedLiveCamera(null);
    setSelectedRiskProjection(null);
    setSelectedExternalEvent(null);
    setSelectedConflictZone(zone);
  }, []);

  const handleVerifyAction = useCallback(
    (eventId: string, action: AlertVerificationAction) => {
      const verifiedAt = new Date();

      setEvents((current) =>
        current.map((event) =>
          event.id === eventId ? applyDemoVerification(event, action, verifiedAt) : event
        )
      );
      setDemoEvents((current) =>
        current.map((event) =>
          event.id === eventId ? applyDemoVerification(event, action, verifiedAt) : event
        )
      );
      setSelectedEvent((current) =>
        current?.id === eventId ? applyDemoVerification(current, action, verifiedAt) : current
      );
    },
    []
  );

  const toggleLayer = (key: keyof typeof initialLayers) => {
    if (
      key === "usgsEarthquakes" &&
      layerSettings.usgsEarthquakes &&
      selectedExternalEvent?.sourceId === "usgs_earthquake"
    ) {
      setSelectedExternalEvent(null);
    }
    if (
      key === "gdacsAlerts" &&
      layerSettings.gdacsAlerts &&
      selectedExternalEvent?.sourceId === "gdacs"
    ) {
      setSelectedExternalEvent(null);
    }
    if (
      key === "noaaTsunami" &&
      layerSettings.noaaTsunami &&
      selectedExternalEvent?.sourceId === "noaa_tsunami"
    ) {
      setSelectedExternalEvent(null);
    }
    if (
      key === "nasaFirms" &&
      layerSettings.nasaFirms &&
      selectedExternalEvent?.sourceId === "nasa_firms"
    ) {
      setSelectedExternalEvent(null);
    }
    if (
      key === "nasaEonet" &&
      layerSettings.nasaEonet &&
      selectedExternalEvent?.sourceId === "nasa-eonet"
    ) {
      setSelectedExternalEvent(null);
    }
    if (key === "liveCameras" && layerSettings.liveCameras) {
      setSelectedLiveCamera(null);
    }
    if (
      ["conflictZones", "conflictEvents", "territorialControl", "crisisNews"].includes(key) &&
      layerSettings[key]
    ) {
      setSelectedConflictZone(null);
    }
    setLayerSettings((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const gpsStatus = useMemo<"active" | "inactive" | "unknown">(() => {
    if (location.status === "granted") return "active";
    if (location.status === "loading" || location.status === "idle") return "unknown";
    return "inactive";
  }, [location.status]);
  const filteredDemoEvents = useMemo(() => {
    const severityFiltered = filterEventsBySeverity(
      demoEvents,
      demoSeverityFilter
    );
    const typeFiltered = filterEventsByType(severityFiltered, demoTypeFilter);
    const lifecycleFiltered = filterEventsByLifecycle(
      typeFiltered,
      demoLifecycleFilter
    );

    return limitVisibleEvents(sortEventsByPriority(lifecycleFiltered), demoEvents.length);
  }, [
    demoEvents,
    demoLifecycleFilter,
    demoSeverityFilter,
    demoTypeFilter,
  ]);
  const visibleDemoEvents = useMemo(
    () => (layerSettings.demoReports ? filteredDemoEvents : []),
    [filteredDemoEvents, layerSettings.demoReports]
  );
  const nearbyEventPool = useMemo(
    () => [...events, ...visibleDemoEvents],
    [events, visibleDemoEvents]
  );
  const activeLayerCount = useMemo(
    () => Object.values(layerSettings).filter(Boolean).length,
    [layerSettings]
  );
  const criticalCount = useMemo(
    () =>
      nearbyEventPool.filter(
        (event) => event.severity === "CRITICAL" && event.status !== "RESOLVED"
      ).length,
    [nearbyEventPool]
  );
  const usgsUpdatedLabel = useMemo(() => {
    if (!usgsUpdatedAt) return null;
    const updatedAt = new Date(usgsUpdatedAt);
    if (Number.isNaN(updatedAt.getTime())) return "Actualizacion recibida";

    return `Actualizado ${new Intl.DateTimeFormat("es-CL", {
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(updatedAt)}`;
  }, [usgsUpdatedAt]);
  const usgsExpiresLabel = useMemo(() => {
    if (!usgsExpiresAt) return null;
    const expiresAt = new Date(usgsExpiresAt);
    if (Number.isNaN(expiresAt.getTime())) return null;

    return new Intl.DateTimeFormat("es-CL", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(expiresAt);
  }, [usgsExpiresAt]);
  const gdacsUpdatedLabel = useMemo(() => {
    if (!gdacsUpdatedAt) return null;
    const updatedAt = new Date(gdacsUpdatedAt);
    if (Number.isNaN(updatedAt.getTime())) return "Actualización recibida";

    return `Actualizado ${new Intl.DateTimeFormat("es-CL", {
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(updatedAt)}`;
  }, [gdacsUpdatedAt]);
  const gdacsExpiresLabel = useMemo(() => {
    if (!gdacsExpiresAt) return null;
    const expiresAt = new Date(gdacsExpiresAt);
    if (Number.isNaN(expiresAt.getTime())) return null;

    return new Intl.DateTimeFormat("es-CL", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(expiresAt);
  }, [gdacsExpiresAt]);
  const noaaUpdatedLabel = useMemo(() => {
    if (!noaaUpdatedAt) return null;
    const updatedAt = new Date(noaaUpdatedAt);
    if (Number.isNaN(updatedAt.getTime())) return "Actualización recibida";

    return `Actualizado ${new Intl.DateTimeFormat("es-CL", {
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(updatedAt)}`;
  }, [noaaUpdatedAt]);
  const noaaExpiresLabel = useMemo(() => {
    if (!noaaExpiresAt) return null;
    const expiresAt = new Date(noaaExpiresAt);
    if (Number.isNaN(expiresAt.getTime())) return null;

    return new Intl.DateTimeFormat("es-CL", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(expiresAt);
  }, [noaaExpiresAt]);
  const noaaMappedCount = useMemo(
    () =>
      noaaEvents.filter(
        (event) =>
          typeof event.latitude === "number" &&
          Number.isFinite(event.latitude) &&
          typeof event.longitude === "number" &&
          Number.isFinite(event.longitude)
      ).length,
    [noaaEvents]
  );
  const visibleNasaEvents = useMemo(
    () => nasaEvents.slice(0, 250),
    [nasaEvents]
  );
  const visibleEonetEvents = useMemo(
    () => eonetEvents.slice(0, 250),
    [eonetEvents]
  );
  const visibleNwsEvents = useMemo(
    () => nwsEvents.slice(0, 250),
    [nwsEvents]
  );
  const externalEvents = useMemo(
    () => [...usgsEvents, ...gdacsEvents, ...noaaEvents, ...visibleNasaEvents, ...visibleEonetEvents, ...visibleNwsEvents],
    [gdacsEvents, noaaEvents, usgsEvents, visibleNasaEvents, visibleEonetEvents, visibleNwsEvents]
  );
  const externalCorrelations = useMemo(
    () => correlateExternalEvents(externalEvents),
    [externalEvents]
  );
  const selectedExternalCorrelations = useMemo(() => {
    if (!selectedExternalEvent) return [];

    return externalCorrelations.filter(
      (correlation) =>
        correlation.primaryEvent.id === selectedExternalEvent.id ||
        correlation.relatedEvents.some(
          (event) => event.id === selectedExternalEvent.id
        )
    );
  }, [externalCorrelations, selectedExternalEvent]);
  const openNotificationOnMap = useCallback(
    (notification: ArgusNotification) => {
      setDisplayMode("map");
      setMapViewMode("map");
      collapseSecondaryPanels();

      const internalEvent = [...events, ...visibleDemoEvents].find(
        (event) =>
          event.id === notification.relatedEventId ||
          event.id === notification.relatedReportId ||
          event.id === notification.relatedIncidentId
      );
      if (internalEvent) {
        selectEvent(internalEvent);
      } else {
        const externalEvent = externalEvents.find(
          (event) => event.id === notification.relatedEventId
        );
        if (externalEvent) {
          selectExternalEvent(externalEvent);
        } else {
          setSelectedEvent(null);
          setSelectedExternalEvent(null);
          setSelectedVisualSource(null);
          setSelectedLiveCamera(null);
          setSelectedRiskProjection(null);
          setSelectedConflictZone(null);
        }
      }

      if (notification.relatedRouteId) {
        setLayerSettings((current) => ({
          ...current,
          terrestrialRoutes: true,
          airRoutes: true,
          maritimeRoutes: true,
        }));
      }
      if (notification.type === "CONFLICT") {
        setLayerSettings((current) => ({
          ...current,
          conflictEvents: true,
          conflictZones: true,
        }));
      }
      if (notification.lat !== null && notification.lng !== null) {
        setNotificationFocusTarget({
          latitude: notification.lat,
          longitude: notification.lng,
          key: Date.now(),
        });
      }
    },
    [
      collapseSecondaryPanels,
      events,
      externalEvents,
      selectEvent,
      selectExternalEvent,
      visibleDemoEvents,
    ]
  );
  const activeConflictZones = useMemo(
    () => (layerSettings.conflictZones ? curatedConflictZones : []),
    [layerSettings.conflictZones]
  );
  const activeConflictEvents = useMemo(
    () => (layerSettings.conflictEvents ? curatedConflictEvents : []),
    [layerSettings.conflictEvents]
  );
  const conflictProximityWarnings = useMemo(
    () =>
      getConflictProximityWarnings(
        { latitude: location.latitude, longitude: location.longitude },
        activeConflictZones,
        activeConflictEvents
      ),
    [activeConflictEvents, activeConflictZones, location.latitude, location.longitude]
  );
  const topConflictWarning = conflictProximityWarnings[0] ?? null;
  const activeWeatherObservation =
    metWeather ?? demoWeatherObservations[0] ?? null;
  const weatherSourceLabel = activeWeatherObservation
    ? activeWeatherObservation.sourceType === "external_forecast"
      ? metCached
        ? "MET-CACHE"
        : "MET-REAL"
      : "DEMO"
    : "SIN DATOS";
  const weatherPressureLabel =
    typeof activeWeatherObservation?.pressureHpa === "number"
      ? `${activeWeatherObservation.pressureHpa.toFixed(0)} hPa`
      : "Presion N/D";
  const weatherWindLabel = activeWeatherObservation
    ? `${activeWeatherObservation.windFromLabel} ${activeWeatherObservation.windSpeedKmh} km/h`
    : "Viento N/D";
  const officialSourceCount = useMemo(
    () =>
      demoVisualSources.filter((source) =>
        ["governmental_osint", "institutional_camera"].includes(source.category)
      ).length,
    []
  );
  const publicCameraCount = useMemo(
    () =>
      demoVisualSources.filter((source) =>
        [
          "open_public_camera",
          "commercial_webcam",
          "media_stream",
          "citizen_stream",
        ].includes(source.category)
      ).length,
    []
  );
  const layerMeta = useMemo<
    Partial<Record<keyof typeof initialLayers, LayerDisplayMeta>>
  >(
    () => ({
      reports: {
        count: events.filter((event) => event.type === "REPORT").length,
        detail: "Reportes ciudadanos",
      },
      missingPersons: {
        count: events.filter(
          (event) => event.category?.toLowerCase() === "missing_person"
        ).length,
        detail: "Reportes ciudadanos de busqueda/rescate",
        status: "ready",
      },
      demoReports: {
        count: demoEvents.length,
        detail: layerSettings.demoReports
          ? `${filteredDemoEvents.length} visibles con filtros`
          : `${demoEvents.length} disponibles para probar`,
        status: layerSettings.demoReports ? "ready" : "idle",
        emphasis: true,
      },
      usgsEarthquakes: {
        count: usgsEvents.length,
        detail:
          usgsStatus === "loading"
            ? "Consultando fuente oficial..."
            : usgsStatus === "error"
              ? "Sin conexion con USGS"
              : usgsStatus === "loaded"
                ? `${usgsCached ? "Caché" : "Red"} · ${
                    usgsUpdatedLabel ?? "actualización recibida"
                  }${usgsExpiresLabel ? ` · vence ${usgsExpiresLabel}` : ""}`
                : "Disponible bajo demanda",
        status:
          usgsStatus === "loaded"
            ? "ready"
            : usgsStatus === "error"
              ? "error"
              : usgsStatus,
      },
      gdacsAlerts: {
        count: gdacsEvents.length,
        detail:
          gdacsStatus === "loading"
            ? "Consultando alertas globales..."
            : gdacsStatus === "error"
              ? "Sin conexión con GDACS"
              : gdacsStatus === "loaded"
                ? `${gdacsCached ? "Caché" : "Red"} · ${
                    gdacsUpdatedLabel ?? "actualización recibida"
                  }${gdacsExpiresLabel ? ` · vence ${gdacsExpiresLabel}` : ""}`
                : "Semáforo global bajo demanda",
        status:
          gdacsStatus === "loaded"
            ? "ready"
            : gdacsStatus === "error"
              ? "error"
              : gdacsStatus,
      },
      noaaTsunami: {
        count: noaaEvents.length,
        detail:
          noaaStatus === "loading"
            ? "Consultando NTWC y PTWC..."
            : noaaStatus === "error"
              ? "Sin conexión con NOAA"
              : noaaStatus === "loaded"
                ? `${noaaCached ? "Caché" : "Red"} · ${noaaMappedCount}/${noaaEvents.length} en mapa · ${
                    noaaUpdatedLabel ?? "actualización recibida"
                  }${noaaExpiresLabel ? ` · vence ${noaaExpiresLabel}` : ""}`
                : "Boletines costeros bajo demanda",
        status:
          noaaStatus === "loaded"
            ? "ready"
            : noaaStatus === "error"
              ? "error"
              : noaaStatus,
      },
      nasaFirms: {
        count: nasaEvents.length,
        detail:
          nasaConfigured === null
            ? nasaConfigError
              ? "No se pudo verificar NASA_FIRMS_MAP_KEY"
              : "Verificando configuración..."
            : !nasaConfigured
              ? "Requiere NASA_FIRMS_MAP_KEY"
              : nasaStatus === "loading"
                ? "Consultando focos térmicos..."
                : nasaStatus === "error"
                  ? "NASA FIRMS no disponible"
                  : nasaStatus === "loaded"
                    ? `${nasaCached ? "Caché" : "Red"} · ${visibleNasaEvents.length}/${nasaEvents.length} en mapa`
                    : "Chile · VIIRS · 1 día",
        status:
          nasaStatus === "loaded"
            ? "ready"
            : nasaStatus === "error"
              ? "error"
              : nasaStatus,
        disabled: nasaConfigured !== true,
        disabledLabel: nasaConfigured === false ? "KEY" : "...",
      },
      nasaEonet: {
        count: eonetEvents.length,
        detail:
          eonetStatus === "loading"
            ? "Consultando eventos naturales NASA..."
            : eonetStatus === "error"
              ? "NASA EONET no disponible"
              : eonetStatus === "loaded"
                ? `${visibleEonetEvents.length}/${eonetEvents.length} eventos en mapa`
                : "NASA EONET Natural Events bajo demanda",
        status:
          eonetStatus === "loaded"
            ? "ready"
            : eonetStatus === "error"
              ? "error"
              : eonetStatus,
      },
      nwsWeatherAlerts: {
        count: nwsEvents.length,
        detail:
          nwsStatus === "loading"
            ? "Consultando alertas meteorologicas NWS..."
            : nwsStatus === "error"
              ? "NWS no disponible"
              : nwsStatus === "loaded"
                ? `${visibleNwsEvents.length}/${nwsEvents.length} alertas en mapa${nwsUserAgentConfigured === false ? " · User-Agent fallback" : ""}`
                : "Estados Unidos y territorios NWS bajo demanda",
        status:
          nwsStatus === "loaded"
            ? "ready"
            : nwsStatus === "error"
              ? "error"
              : nwsStatus,
      },
      openMeteoWeatherContext: {
        count: 0,
        detail: layerSettings.openMeteoWeatherContext
          ? "Overlay contextual activo por incidente/coordenada"
          : "Contexto global por coordenada, no alertas",
        status: "ready",
      },
      usgsWaterConditions: {
        count: 0,
        detail: layerSettings.usgsWaterConditions
          ? "Contexto hidrologico cercano; sin sensores globales"
          : "USGS 00060/00065; no es capa de incidentes",
        status: "ready",
      },
      noaaCoopsCoastalObservations: {
        count: 0,
        detail: layerSettings.noaaCoopsCoastalObservations
          ? "Contexto costero NOAA CO-OPS bajo demanda; sin bulk global"
          : "Observaciones costeras NOAA CO-OPS; no es capa de incidentes",
        status: "ready",
      },
      noaaStormEventsHistorical: {
        count: 0,
        detail: "Dataset historico NOAA/NCEI; import controlado, apagado por defecto",
        status: "idle",
      },
      noaaNceiHistoricalTsunamis: {
        count: 0,
        detail: "Memoria historica tsunami NOAA/NCEI; no live, sin geometria inventada",
        status: "idle",
      },
      openFemaDisasterDeclarations: {
        count: 0,
        detail: "Dataset institucional FEMA; no live, import controlado",
        status: "idle",
      },
      reliefWeb: {
        count: reliefWebEvents.length,
        detail:
          reliefWebConfigured === null
            ? "Verificando configuración..."
            : !reliefWebConfigured
              ? "Requiere RELIEFWEB_APP_NAME"
              : reliefWebStatus === "loading"
                ? "Consultando contexto humanitario..."
                : reliefWebStatus === "error"
                  ? "ReliefWeb no disponible"
                  : reliefWebStatus === "loaded"
                    ? `${reliefWebCached ? "Caché" : "Red / persistido"} · ${reliefWebEvents.length} reportes`
                    : "Contexto humanitario bajo demanda",
        status:
          reliefWebStatus === "loaded"
            ? "ready"
            : reliefWebStatus === "error"
              ? "error"
              : reliefWebStatus,
        disabled: reliefWebConfigured !== true,
        disabledLabel: reliefWebConfigured === false ? "APP" : "...",
      },
      sos: {
        count: events.filter((event) => event.type === "SOS").length,
        detail: "Solicitudes de ayuda",
      },
      alerts: {
        count: events.filter((event) => event.type === "ALERT").length,
        detail: "Alertas operacionales",
      },
      critical: {
        count: criticalCount,
        detail: "Prioridad critica activa",
      },
      resolved: {
        count: events.filter((event) => event.status === "RESOLVED").length,
        detail: "Eventos cerrados",
      },
      visualSources: {
        count: demoVisualSources.length,
        detail: "Todas las fuentes demo",
        status: "ready",
      },
      officialSources: {
        count: officialSourceCount,
        detail: "Gobierno e instituciones",
        status: "ready",
      },
      publicCameras: {
        count: publicCameraCount,
        detail: "Camaras y transmisiones",
        status: "ready",
      },
      liveCameras: {
        count: liveCameras.length,
        detail: layerSettings.liveCameras
          ? `${embeddableLiveCameraCount} embebibles · ${liveCameras.length} publicas`
          : "Capa publica bajo demanda",
        status: "ready",
        emphasis: true,
      },
      medicalPoints: {
        count: demoMedicalPoints.length,
        detail: layerSettings.medicalPoints
          ? "Puntos medicos demo visibles"
          : "AURA Basic bajo demanda",
        status: "ready",
        emphasis: true,
      },
      quakeSense: {
        count: quakeSenseClusters.length,
        detail:
          quakeSenseClusters.length > 0
            ? "Alerta preliminar experimental"
            : "Sensor ciudadano Web/PWA",
        status: quakeSenseClusters.length > 0 ? "ready" : "idle",
        emphasis: true,
      },
      safetyChecks: {
        count: safetyChecks.length,
        detail:
          safetyChecks.length > 0
            ? "Check-ins post-sismo demo"
            : "Arquitectura movil futura",
        status: safetyChecks.length > 0 ? "ready" : "idle",
        emphasis: true,
      },
      weatherRisk: {
        count: demoRiskProjections.length,
        detail:
          metStatus === "loading"
            ? "Cargando viento MET Norway..."
            : metStatus === "loaded"
              ? `${metCached ? "Caché" : "Red"} · viento real · ${demoRiskProjections.length} zonas demo`
              : metStatus === "error"
                ? "MET no disponible · fallback demo"
                : "Zonas demo · MET bajo demanda",
        status:
          metStatus === "loaded"
            ? "ready"
            : metStatus === "error"
              ? "error"
              : metStatus,
      },
      terrestrialRoutes: {
        count: demoRoutes.filter((route) => route.type === "terrestrial").length,
        detail: "Corredor urbano demo",
        status: "ready",
      },
      airRoutes: {
        count: demoRoutes.filter((route) => route.type === "air").length,
        detail: "Trayectoria diferenciada",
        status: "ready",
      },
      maritimeRoutes: {
        count: demoRoutes.filter((route) => route.type === "maritime").length,
        detail: "Referencia en Valparaiso",
        status: "ready",
      },
      conflictZones: {
        count: curatedConflictZones.length,
        detail: layerSettings.conflictZones
          ? "Zonas abiertas y curadas visibles"
          : "Capa neutral bajo demanda",
        status: "ready",
        emphasis: true,
      },
      conflictEvents: {
        count: curatedConflictEvents.length,
        detail: layerSettings.conflictEvents
          ? "Eventos recientes demo visibles"
          : "Ataques/eventos recientes bajo demanda",
        status: "ready",
      },
      territorialControl: {
        count: curatedConflictZones.filter((zone) =>
          ["disputed_control", "occupied_area"].includes(zone.zoneType)
        ).length,
        detail: "Control reportado, no definitivo",
        status: "ready",
      },
      crisisNews: {
        count: curatedNewsEvidence.length,
        detail: "Evidencia secundaria por fuente",
        status: "ready",
      },
      confirmedDisasters: {
        count: curatedConflictZones.filter(
          (zone) => zone.zoneType === "disaster_confirmed"
        ).length,
        detail: "Desastres confirmados en capa de crisis",
        status: "ready",
      },
      user: {
        detail: gpsStatus === "active" ? "Posicion disponible" : "Ubicacion no confirmada",
        status: gpsStatus === "active" ? "ready" : "idle",
      },
    }),
    [
      criticalCount,
      demoEvents.length,
      events,
      filteredDemoEvents.length,
      gdacsCached,
      gdacsEvents.length,
      gdacsExpiresLabel,
      gdacsStatus,
      gdacsUpdatedLabel,
      eonetEvents.length,
      eonetStatus,
      gpsStatus,
      layerSettings.conflictEvents,
      layerSettings.conflictZones,
      layerSettings.demoReports,
      layerSettings.liveCameras,
      layerSettings.medicalPoints,
      layerSettings.openMeteoWeatherContext,
      layerSettings.noaaCoopsCoastalObservations,
      layerSettings.usgsWaterConditions,
      quakeSenseClusters.length,
      safetyChecks.length,
      metCached,
      metStatus,
      nasaCached,
      nasaConfigError,
      nasaConfigured,
      nasaEvents.length,
      nasaStatus,
      noaaCached,
      noaaEvents.length,
      noaaExpiresLabel,
      noaaMappedCount,
      noaaStatus,
      noaaUpdatedLabel,
      nwsEvents.length,
      nwsStatus,
      nwsUserAgentConfigured,
      officialSourceCount,
      publicCameraCount,
      reliefWebCached,
      reliefWebConfigured,
      reliefWebEvents.length,
      reliefWebStatus,
      usgsEvents.length,
      usgsCached,
      usgsExpiresLabel,
      usgsStatus,
      usgsUpdatedLabel,
      visibleEonetEvents.length,
      visibleNasaEvents.length,
      visibleNwsEvents.length,
    ]
  );

  useEffect(() => {
    async function loadSourceStatus() {
      try {
        const response = await fetch("/api/ingest/status", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Estado de fuentes no disponible.");
        const payload = await response.json();
        const nasaSource = Array.isArray(payload.sources)
          ? payload.sources.find(
              (source: { sourceId?: string }) =>
                source.sourceId === "nasa_firms"
            )
          : null;
        const reliefWebSource = Array.isArray(payload.sources)
          ? payload.sources.find(
              (source: { sourceId?: string }) =>
                source.sourceId === "reliefweb"
            )
          : null;
        setNasaConfigured(nasaSource?.configured === true);
        setReliefWebConfigured(reliefWebSource?.configured === true);
        setNasaConfigError(false);
      } catch {
        setNasaConfigured(null);
        setReliefWebConfigured(null);
        setNasaConfigError(true);
      }
    }

    loadSourceStatus();
  }, []);

  useEffect(() => {
    async function loadEvents() {
      try {
        const res = await fetch("/api/events", { cache: "no-store" });
        if (!res.ok) throw new Error("No se pudieron cargar los eventos");
        const data = await res.json();
        let expiredDemoAssigned = false;
        const enrichedEvents = (data.events ?? []).map((event: CrisisEvent) => {
          const normalizedStatus = event.status?.trim().toUpperCase();
          const expiredDemo =
            !expiredDemoAssigned &&
            event.type === "REPORT" &&
            !["RESOLVED", "DISCARDED", "CANCELLED"].includes(normalizedStatus);

          if (expiredDemo) expiredDemoAssigned = true;
          return enrichEventLifecycle(event, { expiredDemo });
        });
        setEvents(enrichedEvents);
      } catch (error) {
        setErrorMessage("Error al cargar eventos. Usando datos locales.");
      }
    }
    loadEvents();
  }, []);

  useEffect(() => {
    if (!layerSettings.usgsEarthquakes || usgsFetchStartedRef.current) return;

    usgsFetchStartedRef.current = true;
    setUsgsStatus("loading");
    setUsgsErrorMessage(null);

    async function loadUsgsEarthquakes() {
      try {
        const response = await fetch("/api/ingest/usgs-earthquakes", {
          cache: "no-store",
        });
        const payload = (await response.json()) as Partial<
          ArgusIngestionSourceResponse
        > & { error?: string };
        if (!response.ok) {
          throw new Error(payload.error || "No fue posible cargar sismos USGS.");
        }

        setUsgsEvents(Array.isArray(payload.events) ? payload.events : []);
        setUsgsUpdatedAt(
          typeof payload.fetchedAt === "string" ? payload.fetchedAt : null
        );
        setUsgsExpiresAt(
          typeof payload.expiresAt === "string" ? payload.expiresAt : null
        );
        setUsgsCached(payload.cached === true);
        setUsgsStatus("loaded");
      } catch (error) {
        setUsgsStatus("error");
        setUsgsErrorMessage(
          error instanceof Error
            ? error.message
            : "No fue posible cargar sismos USGS."
        );
      }
    }

    loadUsgsEarthquakes();
  }, [layerSettings.usgsEarthquakes, usgsRetryVersion]);

  const retryUsgsEarthquakes = () => {
    usgsFetchStartedRef.current = false;
    setUsgsStatus("idle");
    setUsgsErrorMessage(null);
    setUsgsRetryVersion((current) => current + 1);
  };

  useEffect(() => {
    if (!layerSettings.gdacsAlerts || gdacsFetchStartedRef.current) return;

    gdacsFetchStartedRef.current = true;
    setGdacsStatus("loading");
    setGdacsErrorMessage(null);

    async function loadGdacsAlerts() {
      try {
        const response = await fetch("/api/ingest/gdacs-alerts", {
          cache: "no-store",
        });
        const payload = (await response.json()) as Partial<
          ArgusIngestionSourceResponse
        > & { error?: string };
        if (!response.ok) {
          throw new Error(payload.error || "No fue posible cargar alertas GDACS.");
        }

        setGdacsEvents(Array.isArray(payload.events) ? payload.events : []);
        setGdacsUpdatedAt(
          typeof payload.fetchedAt === "string" ? payload.fetchedAt : null
        );
        setGdacsExpiresAt(
          typeof payload.expiresAt === "string" ? payload.expiresAt : null
        );
        setGdacsCached(payload.cached === true);
        setGdacsStatus("loaded");
      } catch (error) {
        setGdacsStatus("error");
        setGdacsErrorMessage(
          error instanceof Error
            ? error.message
            : "No fue posible cargar alertas GDACS."
        );
      }
    }

    loadGdacsAlerts();
  }, [gdacsRetryVersion, layerSettings.gdacsAlerts]);

  const retryGdacsAlerts = () => {
    gdacsFetchStartedRef.current = false;
    setGdacsStatus("idle");
    setGdacsErrorMessage(null);
    setGdacsRetryVersion((current) => current + 1);
  };

  useEffect(() => {
    if (!layerSettings.noaaTsunami || noaaFetchStartedRef.current) return;

    noaaFetchStartedRef.current = true;
    setNoaaStatus("loading");
    setNoaaErrorMessage(null);

    async function loadNoaaTsunami() {
      try {
        const response = await fetch("/api/ingest/noaa-tsunami", {
          cache: "no-store",
        });
        const payload = (await response.json()) as Partial<
          ArgusIngestionSourceResponse
        > & { error?: string };
        if (!response.ok) {
          throw new Error(payload.error || "No fue posible cargar NOAA Tsunami.");
        }

        setNoaaEvents(Array.isArray(payload.events) ? payload.events : []);
        setNoaaUpdatedAt(
          typeof payload.fetchedAt === "string" ? payload.fetchedAt : null
        );
        setNoaaExpiresAt(
          typeof payload.expiresAt === "string" ? payload.expiresAt : null
        );
        setNoaaCached(payload.cached === true);
        setNoaaStatus("loaded");
      } catch (error) {
        setNoaaStatus("error");
        setNoaaErrorMessage(
          error instanceof Error
            ? error.message
            : "No fue posible cargar NOAA Tsunami."
        );
      }
    }

    loadNoaaTsunami();
  }, [layerSettings.noaaTsunami, noaaRetryVersion]);

  const retryNoaaTsunami = () => {
    noaaFetchStartedRef.current = false;
    setNoaaStatus("idle");
    setNoaaErrorMessage(null);
    setNoaaRetryVersion((current) => current + 1);
  };

  useEffect(() => {
    if (
      !layerSettings.nasaFirms ||
      nasaConfigured !== true ||
      nasaFetchStartedRef.current
    ) {
      return;
    }

    nasaFetchStartedRef.current = true;
    setNasaStatus("loading");
    setNasaErrorMessage(null);

    async function loadNasaFirms() {
      try {
        const response = await fetch("/api/ingest/nasa-firms", {
          cache: "no-store",
        });
        const payload = (await response.json()) as Partial<
          ArgusIngestionSourceResponse
        > & { error?: string; disabled?: boolean; reason?: string };
        if (!response.ok) {
          if (payload.disabled) setNasaConfigured(false);
          throw new Error(
            payload.error || payload.reason || "No fue posible cargar NASA FIRMS."
          );
        }

        setNasaEvents(Array.isArray(payload.events) ? payload.events : []);
        setNasaCached(payload.cached === true);
        setNasaStatus("loaded");
      } catch (error) {
        setNasaStatus("error");
        setNasaErrorMessage(
          error instanceof Error
            ? error.message
            : "No fue posible cargar NASA FIRMS."
        );
      }
    }

    loadNasaFirms();
  }, [layerSettings.nasaFirms, nasaConfigured, nasaRetryVersion]);

  const retryNasaFirms = () => {
    nasaFetchStartedRef.current = false;
    setNasaStatus("idle");
    setNasaErrorMessage(null);
    setNasaRetryVersion((current) => current + 1);
  };

  useEffect(() => {
    if (!layerSettings.nasaEonet || eonetFetchStartedRef.current) return;

    eonetFetchStartedRef.current = true;
    setEonetStatus("loading");
    setEonetErrorMessage(null);

    async function loadEonetEvents() {
      try {
        const response = await fetch("/api/knowledge-intake/live/eonet?status=open&days=30&limit=100", {
          cache: "no-store",
        });
        const payload = (await response.json()) as {
          incidents?: ArgusIncidentKnowledge[];
          errors?: string[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error || payload.errors?.[0] || "No fue posible cargar NASA EONET.");
        }

        setEonetEvents(Array.isArray(payload.incidents) ? payload.incidents.map(eonetIncidentToExternalEvent) : []);
        setEonetStatus("loaded");
      } catch (error) {
        setEonetStatus("error");
        setEonetErrorMessage(
          error instanceof Error
            ? error.message
            : "No fue posible cargar NASA EONET."
        );
      }
    }

    loadEonetEvents();
  }, [eonetRetryVersion, layerSettings.nasaEonet]);

  const retryEonetEvents = () => {
    eonetFetchStartedRef.current = false;
    setEonetStatus("idle");
    setEonetErrorMessage(null);
    setEonetRetryVersion((current) => current + 1);
  };

  useEffect(() => {
    if (!layerSettings.nwsWeatherAlerts || nwsFetchStartedRef.current) return;

    nwsFetchStartedRef.current = true;
    setNwsStatus("loading");
    setNwsErrorMessage(null);

    async function loadNwsAlerts() {
      try {
        const response = await fetch("/api/knowledge-intake/live/nws?mode=alerts&area=US&limit=100", {
          cache: "no-store",
        });
        const payload = (await response.json()) as {
          incidents?: ArgusIncidentKnowledge[];
          userAgentConfigured?: boolean;
          warnings?: string[];
          errors?: string[];
          error?: string;
        };
        setNwsUserAgentConfigured(payload.userAgentConfigured ?? null);
        if (!response.ok) {
          throw new Error(payload.error || payload.errors?.[0] || "No fue posible cargar NWS.");
        }

        setNwsEvents(Array.isArray(payload.incidents) ? payload.incidents.map(nwsIncidentToExternalEvent) : []);
        setNwsStatus("loaded");
      } catch (error) {
        setNwsStatus("error");
        setNwsErrorMessage(
          error instanceof Error
            ? error.message
            : "No fue posible cargar NWS."
        );
      }
    }

    loadNwsAlerts();
  }, [layerSettings.nwsWeatherAlerts, nwsRetryVersion]);

  const retryNwsAlerts = () => {
    nwsFetchStartedRef.current = false;
    setNwsStatus("idle");
    setNwsErrorMessage(null);
    setNwsRetryVersion((current) => current + 1);
  };

  useEffect(() => {
    if (
      !layerSettings.reliefWeb ||
      reliefWebConfigured !== true ||
      reliefWebFetchStartedRef.current
    ) {
      return;
    }

    reliefWebFetchStartedRef.current = true;
    setReliefWebStatus("loading");
    setReliefWebErrorMessage(null);

    async function loadReliefWeb() {
      try {
        const response = await fetch("/api/ingest/reliefweb-reports?limit=10", {
          cache: "no-store",
        });
        const payload = (await response.json()) as Partial<
          ArgusIngestionSourceResponse
        > & { error?: string; disabled?: boolean; reason?: string };
        if (!response.ok) {
          if (payload.disabled) setReliefWebConfigured(false);
          throw new Error(
            payload.error ||
              payload.reason ||
              "No fue posible cargar ReliefWeb."
          );
        }

        setReliefWebEvents(
          Array.isArray(payload.events) ? payload.events : []
        );
        setReliefWebCached(payload.cached === true);
        setReliefWebStatus("loaded");
      } catch (error) {
        setReliefWebStatus("error");
        setReliefWebErrorMessage(
          error instanceof Error
            ? error.message
            : "No fue posible cargar ReliefWeb."
        );
      }
    }

    loadReliefWeb();
  }, [
    layerSettings.reliefWeb,
    reliefWebConfigured,
    reliefWebRetryVersion,
  ]);

  useEffect(() => {
    if (!layerSettings.weatherRisk) return;

    const latitude = Number(location.latitude);
    const longitude = Number(location.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

    const controller = new AbortController();
    setMetWeather(null);
    setMetCached(false);
    setMetStatus("loading");
    setMetErrorMessage(null);

    async function loadMetWeather() {
      try {
        const params = new URLSearchParams({
          lat: latitude.toFixed(4),
          lon: longitude.toFixed(4),
        });
        const response = await fetch(`/api/ingest/met-weather?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as Partial<
          MetWeatherSourceResponse
        > & { error?: string };
        if (!response.ok || !payload.weather) {
          throw new Error(
            payload.error || "No fue posible cargar clima MET Norway."
          );
        }

        setMetWeather(payload.weather);
        setMetCached(payload.cached === true);
        setMetStatus("loaded");
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        setMetWeather(null);
        setMetStatus("error");
        setMetErrorMessage(
          error instanceof Error
            ? error.message
            : "No fue posible cargar clima MET Norway."
        );
      }
    }

    loadMetWeather();
    return () => controller.abort();
  }, [
    layerSettings.weatherRisk,
    location.latitude,
    location.longitude,
    metRetryVersion,
  ]);

  const retryMetWeather = () => {
    setMetStatus("idle");
    setMetErrorMessage(null);
    setMetRetryVersion((current) => current + 1);
  };

  useEffect(() => {
    if (!visibleWidgets.risk) return;

    const controller = new AbortController();
    setRiskStatus("loading");
    setRiskErrorMessage(null);

    async function loadRiskAssessments() {
      try {
        const response = await fetch("/api/risk-assessments?limit=40", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as {
          assessments?: ArgusRiskAssessment[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error || "No fue posible calcular prediccion.");
        }
        setRiskAssessments(
          Array.isArray(payload.assessments) ? payload.assessments : []
        );
        setRiskStatus("loaded");
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        setRiskStatus("error");
        setRiskErrorMessage(
          error instanceof Error
            ? error.message
            : "No fue posible calcular prediccion."
        );
      }
    }

    loadRiskAssessments();
    return () => controller.abort();
  }, [riskRefreshVersion, visibleWidgets.risk]);

  const refreshRiskAssessments = () => {
    setRiskRefreshVersion((current) => current + 1);
  };

  async function createReport(payload: {
    category: string;
    title: string;
    description: string;
    latitude: number;
    longitude: number;
    locationText?: string;
    missingPerson?: {
      displayName?: string;
      ageApprox?: string;
      lastSeenText?: string;
      lastSeenAt?: string;
      status?: string;
      relatedEventType?: string;
    };
  }) {
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "No se pudo enviar el reporte");
    setEvents((prev) => [
      enrichEventLifecycle({
        ...data.report,
        type: "REPORT",
        recordType: "Report",
      }),
      ...prev,
    ]);
  }

  async function createHelpRequest(payload: {
    category: string;
    title: string;
    description: string;
    priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    latitude: number;
    longitude: number;
    locationText?: string;
  }) {
    const res = await fetch("/api/help-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "No se pudo enviar la solicitud SOS");
    setEvents((prev) => [
      enrichEventLifecycle({
        ...data.helpRequest,
        type: "SOS",
        recordType: "HelpRequest",
      }),
      ...prev,
    ]);
  }

  return (
    <main className="argus-app-shell relative overflow-hidden bg-slate-950 text-white">
      <OperationalMap
        events={events}
        demoEvents={filteredDemoEvents}
        externalEvents={externalEvents}
        selectedEventId={selectedEvent?.id}
        location={{ latitude: location.latitude, longitude: location.longitude }}
        locationStatus={location.status}
        layerSettings={layerSettings}
        onEventSelect={selectEvent}
        selectedExternalEventId={selectedExternalEvent?.id}
        onExternalEventSelect={selectExternalEvent}
        visualSources={demoVisualSources}
        selectedVisualSourceId={selectedVisualSource?.id}
        onVisualSourceSelect={selectVisualSource}
        liveCameras={liveCameras}
        selectedLiveCameraId={selectedLiveCamera?.id}
        onLiveCameraSelect={selectLiveCamera}
        medicalPoints={demoMedicalPoints}
        medicalAidRequest={medicalAidRequest}
        quakeSenseClusters={quakeSenseClusters}
        safetyChecks={safetyChecks}
        riskProjections={demoRiskProjections}
        onRiskProjectionSelect={selectRiskProjection}
        routes={demoRoutes}
        conflictZones={curatedConflictZones}
        conflictEvents={curatedConflictEvents}
        newsEvidence={curatedNewsEvidence}
        selectedConflictZoneId={selectedConflictZone?.id}
        onConflictZoneSelect={selectConflictZone}
        baseMapType={baseMapType}
        centerRequestKey={centerRequestKey}
        focusTarget={notificationFocusTarget}
        viewMode={mapViewMode}
        onViewModeChange={setMapViewMode}
      />

      <NotificationCenterButton
        unreadCount={notificationSummary?.unread ?? 0}
        criticalCount={notificationSummary?.critical ?? 0}
        open={isNotificationCenterOpen}
        onClick={() => setIsNotificationCenterOpen((current) => !current)}
      />

      <NotificationCenterPanel
        open={isNotificationCenterOpen}
        latitude={location.latitude}
        longitude={location.longitude}
        onClose={() => setIsNotificationCenterOpen(false)}
        onOpenNotification={openNotificationOnMap}
        onSummaryChange={setNotificationSummary}
      />

      <nav
        className={`argus-top-bar argus-view-toolbar pointer-events-auto fixed z-[55] flex max-w-[calc(100%-1rem)] items-center gap-1 overflow-x-auto border border-cyan-300/20 bg-slate-950/95 p-1.5 shadow-xl shadow-black/40 backdrop-blur-xl ${
          displayMode === "command"
            ? "argus-view-toolbar-command"
            : "argus-view-toolbar-map"
        }`}
        aria-label="Vista operacional"
      >
        {([
          ["map", "Vista mapa"],
          ["command", "Paneles"],
          ["layers", "Capas"],
        ] as const).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => changeDisplayMode(mode)}
            className={`min-h-9 shrink-0 border px-3 text-xs font-semibold ${
              displayMode === mode
                ? "border-cyan-300/35 bg-cyan-400/15 text-cyan-100"
                : "border-white/8 bg-white/[0.03] text-slate-300"
            }`}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            location.refreshLocation();
            setCenterRequestKey((current) => current + 1);
          }}
          className="min-h-9 shrink-0 border border-white/10 bg-white/[0.03] px-3 text-xs font-semibold text-slate-200"
        >
          Centrar GPS
        </button>
        <button
          type="button"
          onClick={enterOrbitMode}
          className={`min-h-9 shrink-0 border px-3 text-xs font-semibold ${
            mapViewMode === "orbit"
              ? "border-cyan-300/35 bg-cyan-400/15 text-cyan-100"
              : "border-white/8 bg-white/[0.03] text-slate-300"
          }`}
        >
          Orbit
        </button>
        <a
          href="/app/como-usar"
          className="inline-flex min-h-9 shrink-0 items-center border border-white/10 bg-white/[0.03] px-3 text-xs font-semibold text-slate-200 hover:border-cyan-300/30 hover:text-cyan-100"
        >
          Guia
        </a>
        <a
          href="/app/perfil"
          className="inline-flex min-h-9 shrink-0 items-center border border-white/10 bg-white/[0.03] px-3 text-xs font-semibold text-slate-200 hover:border-cyan-300/30 hover:text-cyan-100"
        >
          Perfil
        </a>
      </nav>

      <div className="argus-mobile-panel argus-widget-rail pointer-events-auto fixed z-[54] flex max-w-[calc(100%-1rem)] gap-1 overflow-x-auto border border-white/10 bg-slate-950/88 p-1 shadow-xl shadow-black/35 backdrop-blur-xl">
        {([
          ["hud", "HUD"],
          ["layers", "Capas"],
          ["weather", "Clima"],
          ["risk", "Riesgo"],
          ["nearby", "Cercanos"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setWidgetVisibility(key, !visibleWidgets[key])}
            className={`min-h-8 shrink-0 border px-2.5 text-[0.62rem] font-bold uppercase ${
              visibleWidgets[key]
                ? "border-cyan-300/25 bg-cyan-400/12 text-cyan-100"
                : "border-white/8 bg-white/[0.03] text-slate-500"
            }`}
            title={`${visibleWidgets[key] ? "Ocultar" : "Mostrar"} ${label}`}
          >
            {label}
          </button>
        ))}
      </div>

      <ArgusModuleLauncher
        location={{ latitude: location.latitude, longitude: location.longitude }}
        onOpen={collapseSecondaryPanels}
        onMedicalAidCreated={(request) => {
          setMedicalAidRequest(request);
          setLayerSettings((current) => ({ ...current, medicalPoints: true }));
        }}
        onQuakeSenseDemoCluster={(cluster) => {
          setQuakeSenseClusters((current) => [
            cluster,
            ...current.filter((item) => item.id !== cluster.id),
          ]);
          setLayerSettings((current) => ({ ...current, quakeSense: true }));
        }}
        onSafetyCheckCreated={(check) => {
          setSafetyChecks((current) => [
            check,
            ...current.filter((item) => item.id !== check.id),
          ]);
          setLayerSettings((current) => ({ ...current, safetyChecks: true }));
        }}
      />

      {displayMode === "command" && visibleWidgets.risk && (
      <div className="argus-left-panel argus-risk-panel-shell pointer-events-auto fixed z-[47] w-[330px] max-w-[calc(100%-1rem)]">
        <RiskAssessmentPanel
          assessments={riskAssessments}
          status={riskStatus}
          errorMessage={riskErrorMessage}
          onRefresh={refreshRiskAssessments}
          onToggleCollapsed={() => setWidgetVisibility("risk", false)}
        />
      </div>
      )}

      {displayMode === "command" && visibleWidgets.hud && (
      <div className="argus-top-hud-shell pointer-events-auto fixed z-40 max-w-6xl">
        <ArgusOperationalHUD
          mode="citizen"
          role="civil"
          coordinates={{ latitude: location.latitude, longitude: location.longitude }}
          gpsStatus={gpsStatus}
          systemStatus={errorMessage ? "degraded" : "online"}
          activeLayerCount={activeLayerCount}
          eventCount={nearbyEventPool.length}
          criticalCount={criticalCount}
          onClose={() => setWidgetVisibility("hud", false)}
        />
      </div>
      )}
      {displayMode === "command" && visibleWidgets.weather && (
      <div className="contents">
      <WindLayerLegend
        observation={activeWeatherObservation}
        selectedProjection={selectedRiskProjection}
        visible={layerSettings.weatherRisk}
        fallbackActive={metStatus !== "loaded"}
        cached={metCached}
        thermalEventCount={
          layerSettings.nasaFirms ? nasaEvents.length : 0
        }
        onClose={() => setWidgetVisibility("weather", false)}
      />
      </div>
      )}

      {displayMode === "command" && layerSettings.weatherRisk && activeWeatherObservation && (
        <div
          className={`argus-left-panel argus-mobile-weather-widget pointer-events-auto fixed z-[48] ${
            visibleWidgets.weather
              ? "argus-mobile-weather-card"
              : "argus-mobile-weather-pill"
          }`}
        >
          {visibleWidgets.weather ? (
            <section className="rounded-lg border border-amber-300/20 bg-slate-950/94 p-3 shadow-2xl shadow-black/35 backdrop-blur-xl">
              <header className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[0.58rem] font-bold uppercase tracking-[0.18em] text-amber-300">
                    Clima
                  </p>
                  <p className="mt-1 truncate text-xs font-semibold text-white">
                    {weatherSourceLabel}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setWidgetVisibility("weather", false)}
                  className="shrink-0 border border-white/10 bg-slate-950/70 px-2 py-1 text-[0.55rem] font-bold uppercase text-slate-300"
                >
                  Ocultar
                </button>
              </header>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[0.68rem] text-slate-300">
                <span className="rounded border border-white/10 bg-slate-900/70 px-2 py-1.5">
                  {weatherPressureLabel}
                </span>
                <span className="rounded border border-white/10 bg-slate-900/70 px-2 py-1.5">
                  {weatherWindLabel}
                </span>
              </div>
              <p className="mt-2 text-[0.62rem] leading-4 text-slate-500">
                Zona estimada, no exacta.
              </p>
            </section>
          ) : (
            <button
              type="button"
              onClick={() => setWidgetVisibility("weather", true)}
              className="rounded-full border border-amber-300/25 bg-slate-950/94 px-3 py-2 text-left text-[0.68rem] font-semibold text-amber-100 shadow-xl shadow-black/35 backdrop-blur-xl"
              aria-label="Mostrar clima"
            >
              Clima: {weatherPressureLabel}
            </button>
          )}
        </div>
      )}

      {(displayMode === "command" || displayMode === "layers") && visibleWidgets.layers && (
      <div className="argus-right-panel argus-layer-panel-shell pointer-events-auto fixed z-[45] w-[310px]">
        <MapLayerControls
          layers={layerSettings}
          onToggle={toggleLayer}
          onClose={() => setWidgetVisibility("layers", false)}
          baseMapType={baseMapType}
          onBaseMapChange={setBaseMapType}
          layerMeta={layerMeta}
          showActiveSummary
          supplementalPanel={
            <>
              <LiveCameraList
                cameras={liveCameras}
                active={Boolean(layerSettings.liveCameras)}
                selectedCameraId={selectedLiveCamera?.id}
                onSelect={selectLiveCamera}
              />
              {/* ReliefWeb temporarily hidden from UI until ingest reliability is fixed. */}
              <ExternalCorrelationsPanel
                correlations={externalCorrelations}
                onSelectEvent={selectExternalEvent}
              />
              <ConflictLegend
                zoneCount={curatedConflictZones.length}
                eventCount={curatedConflictEvents.length}
                newsCount={curatedNewsEvidence.length}
              />
            </>
          }
          demoFilters={{
            severity: demoSeverityFilter,
            type: demoTypeFilter,
            lifecycle: demoLifecycleFilter,
            onSeverityChange: setDemoSeverityFilter,
            onTypeChange: setDemoTypeFilter,
            onLifecycleChange: setDemoLifecycleFilter,
            visibleCount: filteredDemoEvents.length,
            totalCount: demoEvents.length,
          }}
        />
      </div>
      )}

      <div className={displayMode === "command" ? "contents" : "hidden"}>
      {errorMessage && (
        <div className="fixed left-4 top-40 z-40 max-w-sm border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100 backdrop-blur-xl shadow-lg shadow-red-900/20 md:top-32">
          {errorMessage}
        </div>
      )}

      {layerSettings.usgsEarthquakes && usgsStatus === "loading" && (
        <div className="fixed left-4 top-40 z-40 border border-orange-300/20 bg-slate-950/90 px-4 py-3 text-sm text-orange-100 shadow-xl shadow-black/30 backdrop-blur-xl md:top-32">
          Consultando sismos USGS...
        </div>
      )}

      {layerSettings.usgsEarthquakes && usgsStatus === "error" && usgsErrorMessage && (
        <div className="fixed left-4 top-40 z-40 max-w-sm border border-amber-300/25 bg-slate-950/92 px-4 py-3 text-sm text-amber-100 shadow-xl shadow-black/30 backdrop-blur-xl md:top-32">
          <p>Sismos USGS no disponibles: {usgsErrorMessage}</p>
          <button
            type="button"
            onClick={retryUsgsEarthquakes}
            className="mt-3 border border-amber-200/30 bg-amber-400/10 px-3 py-2 text-xs font-semibold uppercase text-amber-100 transition hover:bg-amber-400/20"
          >
            Reintentar
          </button>
        </div>
      )}

      {layerSettings.gdacsAlerts && gdacsStatus === "loading" && (
        <div className="fixed left-4 top-56 z-40 border border-blue-300/20 bg-slate-950/90 px-4 py-3 text-sm text-blue-100 shadow-xl shadow-black/30 backdrop-blur-xl md:top-48">
          Consultando alertas GDACS...
        </div>
      )}

      {layerSettings.gdacsAlerts && gdacsStatus === "error" && gdacsErrorMessage && (
        <div className="fixed left-4 top-56 z-40 max-w-sm border border-blue-300/25 bg-slate-950/92 px-4 py-3 text-sm text-blue-100 shadow-xl shadow-black/30 backdrop-blur-xl md:top-48">
          <p>GDACS no disponible: {gdacsErrorMessage}</p>
          <button
            type="button"
            onClick={retryGdacsAlerts}
            className="mt-3 border border-blue-200/30 bg-blue-400/10 px-3 py-2 text-xs font-semibold uppercase text-blue-100 transition hover:bg-blue-400/20"
          >
            Reintentar
          </button>
        </div>
      )}

      {layerSettings.noaaTsunami && noaaStatus === "loading" && (
        <div className="fixed left-4 top-72 z-40 border border-sky-300/20 bg-slate-950/90 px-4 py-3 text-sm text-sky-100 shadow-xl shadow-black/30 backdrop-blur-xl md:top-64">
          Consultando boletines NOAA Tsunami...
        </div>
      )}

      {layerSettings.noaaTsunami && noaaStatus === "error" && noaaErrorMessage && (
        <div className="fixed left-4 top-72 z-40 max-w-sm border border-sky-300/25 bg-slate-950/92 px-4 py-3 text-sm text-sky-100 shadow-xl shadow-black/30 backdrop-blur-xl md:top-64">
          <p>NOAA Tsunami no disponible: {noaaErrorMessage}</p>
          <button
            type="button"
            onClick={retryNoaaTsunami}
            className="mt-3 border border-sky-200/30 bg-sky-400/10 px-3 py-2 text-xs font-semibold uppercase text-sky-100 transition hover:bg-sky-400/20"
          >
            Reintentar
          </button>
        </div>
      )}

      {layerSettings.weatherRisk && metStatus === "error" && metErrorMessage && (
        <div className="fixed left-4 top-[22rem] z-40 max-w-sm border border-amber-300/25 bg-slate-950/92 px-4 py-3 text-sm text-amber-100 shadow-xl shadow-black/30 backdrop-blur-xl md:top-80">
          <p>MET Norway no disponible. Se mantiene el viento demo.</p>
          <p className="mt-1 text-xs text-amber-100/70">{metErrorMessage}</p>
          <button
            type="button"
            onClick={retryMetWeather}
            className="mt-3 border border-amber-200/30 bg-amber-400/10 px-3 py-2 text-xs font-semibold uppercase text-amber-100 transition hover:bg-amber-400/20"
          >
            Reintentar
          </button>
        </div>
      )}

      {layerSettings.nasaFirms && nasaStatus === "loading" && (
        <div className="fixed left-4 top-[26rem] z-40 border border-orange-300/20 bg-slate-950/90 px-4 py-3 text-sm text-orange-100 shadow-xl shadow-black/30 backdrop-blur-xl md:top-96">
          Consultando focos térmicos NASA FIRMS...
        </div>
      )}

      {layerSettings.nasaFirms && nasaStatus === "error" && nasaErrorMessage && (
        <div className="fixed left-4 top-[26rem] z-40 max-w-sm border border-orange-300/25 bg-slate-950/92 px-4 py-3 text-sm text-orange-100 shadow-xl shadow-black/30 backdrop-blur-xl md:top-96">
          <p>NASA FIRMS no disponible: {nasaErrorMessage}</p>
          <button
            type="button"
            onClick={retryNasaFirms}
            className="mt-3 border border-orange-200/30 bg-orange-400/10 px-3 py-2 text-xs font-semibold uppercase text-orange-100 transition hover:bg-orange-400/20"
          >
            Reintentar
          </button>
        </div>
      )}

      {layerSettings.nasaEonet && eonetStatus === "loading" && (
        <div className="fixed left-4 top-[30rem] z-40 border border-emerald-300/20 bg-slate-950/90 px-4 py-3 text-sm text-emerald-100 shadow-xl shadow-black/30 backdrop-blur-xl md:top-[27rem]">
          Consultando NASA EONET Natural Events...
        </div>
      )}

      {layerSettings.nasaEonet && eonetStatus === "error" && eonetErrorMessage && (
        <div className="fixed left-4 top-[30rem] z-40 max-w-sm border border-emerald-300/25 bg-slate-950/92 px-4 py-3 text-sm text-emerald-100 shadow-xl shadow-black/30 backdrop-blur-xl md:top-[27rem]">
          <p>NASA EONET no disponible: {eonetErrorMessage}</p>
          <button
            type="button"
            onClick={retryEonetEvents}
            className="mt-3 border border-emerald-200/30 bg-emerald-400/10 px-3 py-2 text-xs font-semibold uppercase text-emerald-100 transition hover:bg-emerald-400/20"
          >
            Reintentar
          </button>
        </div>
      )}

      {layerSettings.nwsWeatherAlerts && nwsStatus === "loading" && (
        <div className="fixed left-4 top-[34rem] z-40 border border-cyan-300/20 bg-slate-950/90 px-4 py-3 text-sm text-cyan-100 shadow-xl shadow-black/30 backdrop-blur-xl md:top-[31rem]">
          Consultando NWS Weather Alerts...
        </div>
      )}

      {layerSettings.nwsWeatherAlerts && nwsStatus === "error" && nwsErrorMessage && (
        <div className="fixed left-4 top-[34rem] z-40 max-w-sm border border-cyan-300/25 bg-slate-950/92 px-4 py-3 text-sm text-cyan-100 shadow-xl shadow-black/30 backdrop-blur-xl md:top-[31rem]">
          <p>NWS no disponible: {nwsErrorMessage}</p>
          <button
            type="button"
            onClick={retryNwsAlerts}
            className="mt-3 border border-cyan-200/30 bg-cyan-400/10 px-3 py-2 text-xs font-semibold uppercase text-cyan-100 transition hover:bg-cyan-400/20"
          >
            Reintentar
          </button>
        </div>
      )}

      {topConflictWarning && (
        <div className="fixed left-4 top-[30rem] z-40 max-w-sm border border-red-300/25 bg-slate-950/94 px-4 py-3 text-sm text-red-100 shadow-xl shadow-black/30 backdrop-blur-xl md:top-[28rem]">
          <p className="text-[0.58rem] font-bold uppercase tracking-[0.16em] text-red-200/80">
            Advertencia de proximidad
          </p>
          <p className="mt-1 font-semibold">{topConflictWarning.title}</p>
          <p className="mt-1 text-xs leading-5 text-slate-300">
            {topConflictWarning.reason}
          </p>
          <p className="mt-2 text-xs leading-5 text-amber-100">
            {topConflictWarning.recommendedAction}
          </p>
        </div>
      )}

      {!sessionLoading && !sessionUser ? (
        <a
          href="/login"
          className="argus-login-button pointer-events-auto fixed z-[56] inline-flex min-h-9 items-center justify-center rounded-md border border-cyan-300/25 bg-slate-950/92 px-3 text-xs font-bold uppercase tracking-[0.12em] text-cyan-100 shadow-xl shadow-black/35 backdrop-blur-xl transition hover:border-cyan-200/60 hover:text-white"
        >
          Login
        </a>
      ) : null}
      </div>

      <div className="argus-floating-actions argus-action-stack pointer-events-auto fixed z-50">
        <FloatingSOSButton disabled={!canSOS} onClick={() => setIsHelpOpen(true)} />
        <FloatingReportButton disabled={!canReport} onClick={() => setIsReportOpen(true)} />
      </div>

      <AuraMedicalButton
        onClick={() => {
          collapseSecondaryPanels();
          setIsAuraOpen(true);
        }}
      />

      {isAuraOpen && (
        <AuraMedicalPanel
          location={{ latitude: location.latitude, longitude: location.longitude }}
          onClose={() => setIsAuraOpen(false)}
          onMedicalAidCreated={(request) => {
            setMedicalAidRequest(request);
            setLayerSettings((current) => ({ ...current, medicalPoints: true }));
          }}
        />
      )}

      {displayMode === "command" && visibleWidgets.nearby && (
      <div className="argus-bottom-sheet contents">
      <NearbyEventsSheet
        events={nearbyEventPool}
        latitude={location.latitude}
        longitude={location.longitude}
        onSelect={selectEvent}
        onClose={() => setWidgetVisibility("nearby", false)}
        maxItems={20}
        demoVisibleCount={
          layerSettings.demoReports ? filteredDemoEvents.length : undefined
        }
        demoTotalCount={layerSettings.demoReports ? demoEvents.length : undefined}
      />
      </div>
      )}

      {selectedEvent && (
        <div
          className="argus-mobile-modal fixed inset-0 z-[65] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-6"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedEvent(null);
          }}
        >
          <div
            className="w-full max-w-xl"
            role="dialog"
            aria-modal="true"
            aria-label={`Detalle de ${selectedEvent.title}`}
          >
            <EventDetailPanel
              event={selectedEvent}
              onClose={() => setSelectedEvent(null)}
              onVerifyAction={handleVerifyAction}
              variant="citizen"
            />
          </div>
        </div>
      )}

      <VisualSourcePopup source={selectedVisualSource} onClose={() => setSelectedVisualSource(null)} />
      <LiveCameraPanel
        camera={selectedLiveCamera}
        onClose={() => setSelectedLiveCamera(null)}
      />
      <ExternalEventPopup
        event={selectedExternalEvent}
        onClose={() => setSelectedExternalEvent(null)}
        correlations={selectedExternalCorrelations}
      />
      <ConflictZonePanel
        zone={selectedConflictZone}
        events={curatedConflictEvents}
        newsEvidence={curatedNewsEvidence}
        onClose={() => setSelectedConflictZone(null)}
      />

      <ReportModal
        open={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        onSubmit={createReport}
        session={sessionUser}
        location={{ latitude: location.latitude, longitude: location.longitude }}
      />

      <HelpRequestModal
        open={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
        onSubmit={createHelpRequest}
        session={sessionUser}
        location={{ latitude: location.latitude, longitude: location.longitude }}
      />
    </main>
  );
}
