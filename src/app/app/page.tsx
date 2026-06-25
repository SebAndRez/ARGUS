"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import FloatingSOSButton from "@/components/app/FloatingSOSButton";
import FloatingReportButton from "@/components/app/FloatingReportButton";
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
import { correlateExternalEvents } from "@/lib/ingestion/correlateExternalEvents";

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
  demoReports: false,
  usgsEarthquakes: false,
  gdacsAlerts: false,
  noaaTsunami: false,
  nasaFirms: false,
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
  weatherRisk: true,
  terrestrialRoutes: true,
  airRoutes: true,
  maritimeRoutes: true,
};

const initialEventState: CrisisEvent[] = [];
const defaultVisibleWidgets = {
  hud: true,
  layers: true,
  weather: true,
  nearby: true,
};

export default function AppPage() {
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
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const location = useUserLocation();
  const { user: sessionUser, loading: sessionLoading } = useSession();

  const canReport = Boolean(sessionUser && !["LIMITED", "SUSPENDED", "BANNED"].includes(sessionUser.accountStatus));
  const canSOS = Boolean(sessionUser);

  const changeDisplayMode = useCallback(
    (mode: "command" | "map" | "layers") => {
      setDisplayMode(mode);
      try {
        window.localStorage.setItem("argus-display-mode", mode);
      } catch {
        // Storage can be unavailable in Safari private mode.
      }
    },
    []
  );

  const setWidgetVisibility = useCallback(
    (key: keyof typeof visibleWidgets, visible: boolean) => {
      setVisibleWidgets((current) => {
        const next = { ...current, [key]: visible };
        try {
          window.localStorage.setItem("argus-visible-widgets", JSON.stringify(next));
        } catch {
          // Storage can be unavailable in Safari private mode.
        }
        return next;
      });
    },
    []
  );

  const selectEvent = useCallback((event: CrisisEvent) => {
    setSelectedVisualSource(null);
    setSelectedLiveCamera(null);
    setSelectedRiskProjection(null);
    setSelectedExternalEvent(null);
    setSelectedEvent(event);
  }, []);

  const selectVisualSource = useCallback((source: VisualSource) => {
    setSelectedEvent(null);
    setSelectedLiveCamera(null);
    setSelectedRiskProjection(null);
    setSelectedExternalEvent(null);
    setSelectedVisualSource(source);
  }, []);

  const selectLiveCamera = useCallback((camera: ArgusLiveCamera) => {
    setSelectedEvent(null);
    setSelectedVisualSource(null);
    setSelectedRiskProjection(null);
    setSelectedExternalEvent(null);
    setSelectedLiveCamera(camera);
  }, []);

  const selectRiskProjection = useCallback((projection: RiskProjection) => {
    setSelectedEvent(null);
    setSelectedVisualSource(null);
    setSelectedLiveCamera(null);
    setSelectedExternalEvent(null);
    setSelectedRiskProjection(projection);
  }, []);

  const selectExternalEvent = useCallback((event: ArgusNormalizedEvent) => {
    setSelectedEvent(null);
    setSelectedVisualSource(null);
    setSelectedLiveCamera(null);
    setSelectedRiskProjection(null);
    setSelectedExternalEvent(event);
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
    if (key === "liveCameras" && layerSettings.liveCameras) {
      setSelectedLiveCamera(null);
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
  const visibleDemoEvents = layerSettings.demoReports ? filteredDemoEvents : [];
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
  const externalEvents = useMemo(
    () => [...usgsEvents, ...gdacsEvents, ...noaaEvents, ...visibleNasaEvents],
    [gdacsEvents, noaaEvents, usgsEvents, visibleNasaEvents]
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
  const activeWeatherObservation =
    metWeather ?? demoWeatherObservations[0] ?? null;
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
      gpsStatus,
      layerSettings.demoReports,
      layerSettings.liveCameras,
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
      visibleNasaEvents.length,
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

  async function createReport(payload: {
    category: string;
    title: string;
    description: string;
    latitude: number;
    longitude: number;
    locationText?: string;
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
        riskProjections={demoRiskProjections}
        onRiskProjectionSelect={selectRiskProjection}
        routes={demoRoutes}
        baseMapType={baseMapType}
        centerRequestKey={centerRequestKey}
      />

      <nav
        className={`argus-view-toolbar pointer-events-auto fixed z-[55] flex max-w-[calc(100%-1rem)] items-center gap-1 overflow-x-auto border border-cyan-300/20 bg-slate-950/95 p-1.5 shadow-xl shadow-black/40 backdrop-blur-xl ${
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
      </nav>

      <div className="argus-widget-rail pointer-events-auto fixed z-[54] flex max-w-[calc(100%-1rem)] gap-1 overflow-x-auto border border-white/10 bg-slate-950/88 p-1 shadow-xl shadow-black/35 backdrop-blur-xl">
        {([
          ["hud", "HUD"],
          ["layers", "Capas"],
          ["weather", "Clima"],
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

      {displayMode === "command" && visibleWidgets.hud && (
      <div className="argus-safe-top pointer-events-auto fixed left-1/2 z-40 w-[calc(100%-1.5rem)] max-w-6xl -translate-x-1/2">
        <button
          type="button"
          onClick={() => setWidgetVisibility("hud", false)}
          className="absolute right-2 top-2 z-10 border border-white/10 bg-slate-950/80 px-2 py-1 text-[0.56rem] font-bold uppercase text-slate-400 hover:text-white"
        >
          Ocultar
        </button>
        <ArgusOperationalHUD
          mode="citizen"
          role="civil"
          coordinates={{ latitude: location.latitude, longitude: location.longitude }}
          gpsStatus={gpsStatus}
          systemStatus={errorMessage ? "degraded" : "online"}
          activeLayerCount={activeLayerCount}
          eventCount={nearbyEventPool.length}
          criticalCount={criticalCount}
        />
      </div>
      )}
      {displayMode === "command" && visibleWidgets.weather && (
      <div className="contents">
      <button
        type="button"
        onClick={() => setWidgetVisibility("weather", false)}
        className="argus-weather-hide-button pointer-events-auto fixed z-[46] border border-white/10 bg-slate-950/86 px-2 py-1 text-[0.56rem] font-bold uppercase text-slate-400 shadow-lg shadow-black/25 backdrop-blur-xl hover:text-white"
      >
        Ocultar clima
      </button>
      <WindLayerLegend
        observation={activeWeatherObservation}
        selectedProjection={selectedRiskProjection}
        visible={layerSettings.weatherRisk}
        fallbackActive={metStatus !== "loaded"}
        cached={metCached}
        thermalEventCount={
          layerSettings.nasaFirms ? nasaEvents.length : 0
        }
      />
      </div>
      )}

      {(displayMode === "command" || displayMode === "layers") && visibleWidgets.layers && (
      <div className="argus-layer-panel-shell pointer-events-auto fixed z-[45] w-[310px]">
        <button
          type="button"
          onClick={() => setWidgetVisibility("layers", false)}
          className="absolute right-2 top-2 z-10 border border-white/10 bg-slate-950/80 px-2 py-1 text-[0.56rem] font-bold uppercase text-slate-400 hover:text-white"
        >
          Ocultar
        </button>
        <MapLayerControls
          layers={layerSettings}
          onToggle={toggleLayer}
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

      {!sessionLoading && !sessionUser ? (
        <div className="fixed bottom-32 left-4 z-40 rounded-3xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 backdrop-blur-xl shadow-lg shadow-amber-900/20">
          Inicia sesión en <a href="/login" className="font-semibold text-white underline">/login</a> para crear reportes y SOS.
        </div>
      ) : null}
      </div>

      <FloatingSOSButton disabled={!canSOS} onClick={() => setIsHelpOpen(true)} />
      <FloatingReportButton disabled={!canReport} onClick={() => setIsReportOpen(true)} />

      {displayMode === "command" && visibleWidgets.nearby && (
      <div className="contents">
      <button
        type="button"
        onClick={() => setWidgetVisibility("nearby", false)}
        className="argus-nearby-hide-button pointer-events-auto fixed z-[51] border border-white/10 bg-slate-950/86 px-2 py-1 text-[0.56rem] font-bold uppercase text-slate-400 shadow-lg shadow-black/25 backdrop-blur-xl hover:text-white"
      >
        Ocultar cercanos
      </button>
      <NearbyEventsSheet
        events={nearbyEventPool}
        latitude={location.latitude}
        longitude={location.longitude}
        onSelect={selectEvent}
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
