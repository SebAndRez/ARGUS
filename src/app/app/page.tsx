"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import OperationalMap from "@/components/map/OperationalMap";
import MapHUD from "@/components/map/MapHUD";
import MapLayerControls from "@/components/map/MapLayerControls";
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
import {
  demoRiskProjections,
  demoWeatherObservations,
} from "@/data/demoWeatherRisk";
import type { CrisisEvent, SessionUser } from "@/types/crisis";
import type { VisualSource } from "@/types/visualSource";
import type { RiskProjection } from "@/types/weatherRisk";

const initialLayers = {
  reports: true,
  sos: true,
  alerts: true,
  critical: true,
  resolved: true,
  user: true,
  visualSources: true,
  weatherRisk: true,
};

const initialEventState: CrisisEvent[] = [];

export default function AppPage() {
  const [selectedEvent, setSelectedEvent] = useState<CrisisEvent | null>(null);
  const [selectedVisualSource, setSelectedVisualSource] = useState<VisualSource | null>(null);
  const [selectedRiskProjection, setSelectedRiskProjection] = useState<RiskProjection | null>(
    demoRiskProjections[0] ?? null
  );
  const [events, setEvents] = useState<CrisisEvent[]>(initialEventState);
  const [layerSettings, setLayerSettings] = useState(initialLayers);
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

  const toggleLayer = (key: keyof typeof initialLayers) => {
    setLayerSettings((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const gpsStatus = useMemo(() => {
    if (location.status === "loading") return "Buscando GPS";
    if (location.status === "granted") return "GPS activo";
    if (location.status === "denied" || location.status === "error") return "GPS denegado";
    return "GPS no disponible";
  }, [location.status]);

  useEffect(() => {
    async function loadEvents() {
      try {
        const res = await fetch("/api/events", { cache: "no-store" });
        if (!res.ok) throw new Error("No se pudieron cargar los eventos");
        const data = await res.json();
        setEvents(data.events ?? []);
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
      {
        ...data.report,
        type: "REPORT",
        recordType: "Report",
      },
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
      {
        ...data.helpRequest,
        type: "SOS",
        recordType: "HelpRequest",
      },
      ...prev,
    ]);
  }

  return (
    <main className="relative h-screen min-h-screen overflow-hidden bg-slate-950 text-white">
      <OperationalMap
        events={events}
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
      />

      <MapHUD gpsStatus={gpsStatus} />
      <WindLayerLegend
        observation={demoWeatherObservations[0] ?? null}
        selectedProjection={selectedRiskProjection}
        visible={layerSettings.weatherRisk}
      />

      <div className="pointer-events-auto fixed right-4 top-28 z-40 w-[min(320px,calc(100%-2rem))] md:w-[320px]">
        <MapLayerControls layers={layerSettings} onToggle={toggleLayer} />
      </div>

      <div className="pointer-events-none fixed left-4 top-20 z-40 hidden max-w-xs rounded-3xl border border-cyan-400/20 bg-slate-950/85 p-4 text-sm text-slate-200 backdrop-blur-xl shadow-2xl shadow-black/40 md:block">
        <p className="text-[0.68rem] uppercase tracking-[0.36em] text-cyan-300/85">Modo ciudadano</p>
        <p className="mt-3 text-base font-semibold text-white">Interfaz táctica móvil.</p>
        <p className="mt-2 text-xs text-slate-400">Explora incidentes, marca SOS y mantén el control del perímetro.</p>
      </div>

      {location.status === "fallback" && (
        <div className="pointer-events-none fixed top-20 left-1/2 z-40 flex w-[calc(100%-2rem)] -translate-x-1/2 items-center justify-center rounded-3xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-center text-sm text-red-100 backdrop-blur-xl shadow-lg shadow-red-900/20 md:w-[min(520px,calc(100%-3rem))]">
          GPS no disponible, usando ubicación demo.
        </div>
      )}

      {!sessionLoading && !sessionUser && (
        <div className="fixed left-4 top-4 z-40 rounded-3xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 backdrop-blur-xl shadow-lg shadow-amber-900/20">
          Inicia sesión para enviar reportes y SOS.
        </div>
      )}

      {errorMessage && (
        <div className="fixed left-4 top-24 z-40 rounded-3xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100 backdrop-blur-xl shadow-lg shadow-red-900/20">
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

      <NearbyEventsSheet events={events} latitude={location.latitude} longitude={location.longitude} onSelect={selectEvent} />

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
