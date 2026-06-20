"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import OperationalMap from "@/components/map/OperationalMap";
import ArgusOperationalHUD from "@/components/map/ArgusOperationalHUD";
import MapLayerControls, {
  type LayerDisplayMeta,
} from "@/components/map/MapLayerControls";
import EventDetailPanel from "@/components/map/EventDetailPanel";
import ExternalEventPopup from "@/components/map/ExternalEventPopup";
import ExternalCorrelationsPanel from "@/components/map/ExternalCorrelationsPanel";
import VisualSourcePopup from "@/components/map/VisualSourcePopup";
import WindLayerLegend from "@/components/map/WindLayerLegend";
import FloatingSOSButton from "@/components/app/FloatingSOSButton";
import FloatingReportButton from "@/components/app/FloatingReportButton";
import NearbyEventsSheet from "@/components/app/NearbyEventsSheet";
import ReportModal from "@/components/app/ReportModal";
import HelpRequestModal from "@/components/app/HelpRequestModal";
import { useSession } from "@/hooks/useSession";
import { useUserLocation } from "@/hooks/useUserLocation";
import { demoVisualSources } from "@/data/demoVisualSources";
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
  SessionUser,
} from "@/types/crisis";
import type { VisualSource } from "@/types/visualSource";
import type { RiskProjection } from "@/types/weatherRisk";
import type { BaseMapType } from "@/types/map";
import type {
  ArgusIngestionSourceResponse,
  ArgusNormalizedEvent,
} from "@/types/ingestion";
import { correlateExternalEvents } from "@/lib/ingestion/correlateExternalEvents";

const initialLayers = {
  reports: true,
  demoReports: false,
  usgsEarthquakes: false,
  gdacsAlerts: false,
  noaaTsunami: false,
  sos: true,
  alerts: true,
  critical: true,
  resolved: true,
  user: true,
  visualSources: true,
  officialSources: true,
  publicCameras: true,
  weatherRisk: true,
  terrestrialRoutes: true,
  airRoutes: true,
  maritimeRoutes: true,
};

const initialEventState: CrisisEvent[] = [];

export default function AppPage() {
  const [selectedEvent, setSelectedEvent] = useState<CrisisEvent | null>(null);
  const [selectedVisualSource, setSelectedVisualSource] = useState<VisualSource | null>(null);
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
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const location = useUserLocation();
  const { user: sessionUser, loading: sessionLoading } = useSession();

  const canReport = Boolean(sessionUser && !["LIMITED", "SUSPENDED", "BANNED"].includes(sessionUser.accountStatus));
  const canSOS = Boolean(sessionUser);

  const selectEvent = useCallback((event: CrisisEvent) => {
    setSelectedVisualSource(null);
    setSelectedRiskProjection(null);
    setSelectedExternalEvent(null);
    setSelectedEvent(event);
  }, []);

  const selectVisualSource = useCallback((source: VisualSource) => {
    setSelectedEvent(null);
    setSelectedRiskProjection(null);
    setSelectedExternalEvent(null);
    setSelectedVisualSource(source);
  }, []);

  const selectRiskProjection = useCallback((projection: RiskProjection) => {
    setSelectedEvent(null);
    setSelectedVisualSource(null);
    setSelectedExternalEvent(null);
    setSelectedRiskProjection(projection);
  }, []);

  const selectExternalEvent = useCallback((event: ArgusNormalizedEvent) => {
    setSelectedEvent(null);
    setSelectedVisualSource(null);
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
  const externalEvents = useMemo(
    () => [...usgsEvents, ...gdacsEvents, ...noaaEvents],
    [gdacsEvents, noaaEvents, usgsEvents]
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
      weatherRisk: {
        count: demoRiskProjections.length,
        detail: "Zonas estimadas, no exactas",
        status: "ready",
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
      noaaCached,
      noaaEvents.length,
      noaaExpiresLabel,
      noaaMappedCount,
      noaaStatus,
      noaaUpdatedLabel,
      officialSourceCount,
      publicCameraCount,
      usgsEvents.length,
      usgsCached,
      usgsExpiresLabel,
      usgsStatus,
      usgsUpdatedLabel,
    ]
  );

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
    <main className="relative h-screen min-h-screen overflow-hidden bg-slate-950 text-white">
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
        riskProjections={demoRiskProjections}
        onRiskProjectionSelect={selectRiskProjection}
        routes={demoRoutes}
        baseMapType={baseMapType}
      />

      <div className="pointer-events-auto fixed left-1/2 top-3 z-40 w-[calc(100%-1.5rem)] max-w-6xl -translate-x-1/2">
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
      <WindLayerLegend
        observation={demoWeatherObservations[0] ?? null}
        selectedProjection={selectedRiskProjection}
        visible={layerSettings.weatherRisk}
      />

      <div className="pointer-events-auto fixed right-3 top-40 z-40 w-[min(310px,calc(100%-1.5rem))] md:right-4 md:top-32 md:w-[310px]">
        <MapLayerControls
          layers={layerSettings}
          onToggle={toggleLayer}
          baseMapType={baseMapType}
          onBaseMapChange={setBaseMapType}
          layerMeta={layerMeta}
          showActiveSummary
          supplementalPanel={
            <ExternalCorrelationsPanel
              correlations={externalCorrelations}
              onSelectEvent={selectExternalEvent}
            />
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

      {!sessionLoading && !sessionUser ? (
        <div className="fixed bottom-32 left-4 z-40 rounded-3xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 backdrop-blur-xl shadow-lg shadow-amber-900/20">
          Inicia sesión en <a href="/login" className="font-semibold text-white underline">/login</a> para crear reportes y SOS.
        </div>
      ) : null}

      <FloatingSOSButton disabled={!canSOS} onClick={() => setIsHelpOpen(true)} />
      <FloatingReportButton disabled={!canReport} onClick={() => setIsReportOpen(true)} />

      <button
        type="button"
        onClick={location.refreshLocation}
        className="fixed bottom-28 left-4 z-40 rounded-3xl border border-cyan-400/20 bg-slate-900/90 px-4 py-3 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-500/20"
      >
        Mi ubicación
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

      {selectedEvent && (
        <div
          className="fixed inset-0 z-[65] flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm sm:items-center sm:p-6"
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
