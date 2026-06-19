"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import OperationalMap from "@/components/map/OperationalMap";
import ArgusOperationalHUD from "@/components/map/ArgusOperationalHUD";
import MapLayerControls from "@/components/map/MapLayerControls";
import EventDetailPanel from "@/components/map/EventDetailPanel";
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

const initialLayers = {
  reports: true,
  demoReports: false,
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
  const [events, setEvents] = useState<CrisisEvent[]>(initialEventState);
  const [demoEvents, setDemoEvents] = useState<CrisisEvent[]>(() => [...demoCrisisEvents]);
  const [layerSettings, setLayerSettings] = useState(initialLayers);
  const [baseMapType, setBaseMapType] = useState<BaseMapType>("tactical");
  const [demoSeverityFilter, setDemoSeverityFilter] =
    useState<DemoSeverityFilter>("ALL");
  const [demoTypeFilter, setDemoTypeFilter] = useState<DemoTypeFilter>("ALL");
  const [demoLifecycleFilter, setDemoLifecycleFilter] =
    useState<DemoLifecycleFilter>("ALL");
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
    setSelectedEvent(event);
  }, []);

  const selectVisualSource = useCallback((source: VisualSource) => {
    setSelectedEvent(null);
    setSelectedRiskProjection(null);
    setSelectedVisualSource(source);
  }, []);

  const selectRiskProjection = useCallback((projection: RiskProjection) => {
    setSelectedEvent(null);
    setSelectedVisualSource(null);
    setSelectedRiskProjection(projection);
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
        selectedEventId={selectedEvent?.id}
        location={{ latitude: location.latitude, longitude: location.longitude }}
        locationStatus={location.status}
        layerSettings={layerSettings}
        onEventSelect={selectEvent}
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
