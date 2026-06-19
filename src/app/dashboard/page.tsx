"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import OperationalMap from "@/components/map/OperationalMap";
import ArgusOperationalHUD from "@/components/map/ArgusOperationalHUD";
import DashboardCommandPanel from "@/components/dashboard/DashboardCommandPanel";
import EventDetailPanel from "@/components/map/EventDetailPanel";
import VisualSourcePopup from "@/components/map/VisualSourcePopup";
import DashboardUsersPanel from "@/components/dashboard/DashboardUsersPanel";
import AuditLogPanel from "@/components/dashboard/AuditLogPanel";
import type { MapLayerState } from "@/components/map/MapLayerControls";
import { useUserLocation } from "@/hooks/useUserLocation";
import { useSession } from "@/hooks/useSession";
import { demoVisualSources } from "@/data/demoVisualSources";
import { demoRiskProjections } from "@/data/demoWeatherRisk";
import { demoRoutes } from "@/data/demoRoutes";
import type { CrisisEvent } from "@/types/crisis";
import type { VisualSource } from "@/types/visualSource";
import type { BaseMapType } from "@/types/map";

const initialLayers: MapLayerState = {
  reports: true,
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

interface UserListItem {
  id: string;
  publicAlias: string;
  role: string;
  accountStatus: string;
  trustScore: number;
  strikes: number;
}

interface AuditLogItem {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: string | null;
  createdAt: string;
}

const SANCTION_TYPES = ["WARNING", "LIMITATION", "SUSPENSION", "BAN", "RESTORE"] as const;

export default function DashboardPage() {
  const [events, setEvents] = useState<CrisisEvent[]>([]);
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<CrisisEvent | null>(null);
  const [selectedVisualSource, setSelectedVisualSource] = useState<VisualSource | null>(null);
  const [layerSettings, setLayerSettings] = useState(initialLayers);
  const [baseMapType, setBaseMapType] = useState<BaseMapType>("tactical");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [sanctionTarget, setSanctionTarget] = useState<string>("");
  const [sanctionType, setSanctionType] = useState<typeof SANCTION_TYPES[number]>("WARNING");
  const [sanctionReason, setSanctionReason] = useState("");

  const location = useUserLocation();
  const { user: sessionUser, loading: sessionLoading } = useSession();
  const authorized = Boolean(sessionUser && ["OPERATOR", "ADMIN"].includes(sessionUser.role));

  const gpsStatus = useMemo<"active" | "inactive" | "unknown">(() => {
    if (location.status === "granted") return "active";
    if (location.status === "loading" || location.status === "idle") return "unknown";
    return "inactive";
  }, [location.status]);
  const activeLayerCount = useMemo(
    () => Object.values(layerSettings).filter(Boolean).length,
    [layerSettings]
  );
  const activeEventCount = useMemo(
    () => events.filter((event) => event.status !== "RESOLVED").length,
    [events]
  );
  const criticalCount = useMemo(
    () => events.filter((event) => event.severity === "CRITICAL" && event.status !== "RESOLVED").length,
    [events]
  );

  const selectEvent = useCallback((event: CrisisEvent) => {
    setSelectedVisualSource(null);
    setSelectedEvent(event);
  }, []);

  const selectVisualSource = useCallback((source: VisualSource) => {
    setSelectedEvent(null);
    setSelectedVisualSource(source);
  }, []);

  useEffect(() => {
    async function loadEvents() {
      try {
        const res = await fetch("/api/events", { cache: "no-store" });
        const data = await res.json();
        setEvents(data.events ?? []);
      } catch {
        setStatusMessage("No se pudieron cargar los eventos en este momento.");
      }
    }

    loadEvents();
  }, []);

  useEffect(() => {
    if (!authorized) return;

    async function loadUsersAndLogs() {
      try {
        const [usersRes, logsRes] = await Promise.all([
          fetch("/api/users", { cache: "no-store" }),
          fetch("/api/audit/logs", { cache: "no-store" }),
        ]);

        if (usersRes.ok) {
          const usersData = await usersRes.json();
          setUsers(usersData.users ?? []);
          if (usersData.users?.length > 0 && !sanctionTarget) {
            setSanctionTarget(usersData.users[0].id);
          }
        }

        if (logsRes.ok) {
          const logsData = await logsRes.json();
          setLogs(logsData.logs ?? []);
        }
      } catch {
        setStatusMessage("No se pudieron cargar usuarios o registros de auditoría.");
      }
    }

    loadUsersAndLogs();
  }, [authorized, sanctionTarget]);

  async function handleEventAction(action: string) {
    if (!selectedEvent) return;
    try {
      const endpoint = selectedEvent.type === "REPORT" ? "/api/reports" : "/api/help-requests";
      const res = await fetch(`${endpoint}/${selectedEvent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fallo al actualizar evento.");
      setEvents((current) =>
        current.map((event) => (event.id === selectedEvent.id ? { ...event, status: data.report?.status ?? data.helpRequest?.status ?? event.status } : event))
      );
      setSelectedEvent((current) => (current?.id === selectedEvent.id ? { ...current, status: data.report?.status ?? data.helpRequest?.status ?? current.status } : current));
      setStatusMessage("Evento actualizado correctamente.");
    } catch (error) {
      setStatusMessage((error as Error).message);
    }
  }

  async function handleSanctionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sanctionTarget || !sanctionReason) {
      setStatusMessage("Seleccione usuario y motivo para sancionar.");
      return;
    }

    try {
      const res = await fetch("/api/sanctions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: sanctionTarget, type: sanctionType, reason: sanctionReason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo aplicar la sanción.");
      setStatusMessage("Sanción aplicada correctamente.");
      setSanctionReason("");
      setUsers((current) => current.map((user) => (user.id === sanctionTarget ? { ...user, accountStatus: sanctionType === "RESTORE" ? "ACTIVE" : user.accountStatus } : user)));
    } catch (error) {
      setStatusMessage((error as Error).message);
    }
  }

  const toggleLayer = (key: keyof MapLayerState) => {
    setLayerSettings((current) => ({ ...current, [key]: !current[key] }));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/92 px-4 py-3 backdrop-blur-xl xl:px-8">
        <ArgusOperationalHUD
          mode="command"
          role={sessionUser?.role === "ADMIN" ? "admin" : "operator"}
          coordinates={{ latitude: location.latitude, longitude: location.longitude }}
          gpsStatus={gpsStatus}
          systemStatus="online"
          activeLayerCount={activeLayerCount}
          eventCount={activeEventCount}
          criticalCount={criticalCount}
        />
      </header>

      {statusMessage && (
        <div className="mx-4 mt-4 rounded-3xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100 backdrop-blur-xl xl:mx-8">
          {statusMessage}
        </div>
      )}

      <main className="grid min-h-[calc(100vh-170px)] min-w-0 gap-5 px-4 pb-8 pt-5 xl:h-[calc(100dvh-170px)] xl:min-h-0 xl:grid-cols-[320px_minmax(0,1fr)_420px] xl:px-8">
        <div className="min-h-0 min-w-0 xl:h-full xl:overflow-y-auto xl:pr-1">
          <DashboardCommandPanel
            events={events}
            layers={layerSettings}
            onToggleLayer={toggleLayer}
            baseMapType={baseMapType}
            onBaseMapChange={setBaseMapType}
            onSelectEvent={selectEvent}
          />
        </div>

        <div className="relative h-[55vh] min-h-[420px] min-w-0 overflow-hidden rounded-lg border border-white/10 bg-slate-950/70 shadow-2xl shadow-black/40 sm:h-[600px] xl:h-full xl:min-h-0">
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
            routes={demoRoutes}
            baseMapType={baseMapType}
          />
        </div>

        <div className="grid min-h-0 min-w-0 auto-rows-max content-start gap-6 xl:h-full xl:overflow-y-auto xl:overscroll-contain xl:pr-1">
          <EventDetailPanel event={selectedEvent} onCenter={setSelectedEvent} />
          <DashboardUsersPanel users={users} />
          <AuditLogPanel logs={logs} />

          {authorized && (
            <section className="rounded-[32px] border border-white/10 bg-slate-950/85 p-6 shadow-2xl shadow-black/30 backdrop-blur-xl">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-cyan-300/75">Control rápido</p>
                  <h2 className="mt-2 text-xl font-semibold text-white">Acciones del operador</h2>
                </div>
              </div>

              {selectedEvent ? (
                <div className="grid gap-4">
                  <p className="text-sm text-slate-400">Acciones disponibles para el evento seleccionado.</p>
                  <div className="flex flex-wrap gap-3">
                    {(selectedEvent.type === "REPORT" ? [
                      { label: "Validar", action: "VALIDATE" },
                      { label: "Descartar", action: "DISCARD" },
                      { label: "Falso", action: "FALSE" },
                      { label: "Escalar", action: "ESCALATE" },
                      { label: "Resolver", action: "RESOLVE" },
                    ] : [
                      { label: "Revisar", action: "REVIEW" },
                      { label: "Asignar", action: "ASSIGN" },
                      { label: "Resolver", action: "RESOLVE" },
                      { label: "Cancelar", action: "CANCEL" },
                    ]).map((item) => (
                      <button
                        key={item.action}
                        type="button"
                        onClick={() => handleEventAction(item.action)}
                        className="rounded-3xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-400">Selecciona un evento para ver acciones rápidas.</p>
              )}

              <form onSubmit={handleSanctionSubmit} className="mt-6 grid gap-4">
                <div className="grid gap-2 text-sm text-slate-300">
                  <label className="grid gap-2 text-slate-200">Objetivo de sanción</label>
                  <select value={sanctionTarget} onChange={(event) => setSanctionTarget(event.target.value)} className="rounded-2xl border border-white/10 bg-slate-900/90 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/70">
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>{user.publicAlias} · {user.accountStatus}</option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-3">
                  <select value={sanctionType} onChange={(event) => setSanctionType(event.target.value as typeof SANCTION_TYPES[number])} className="flex-1 rounded-2xl border border-white/10 bg-slate-900/90 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/70">
                    {SANCTION_TYPES.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                  <input
                    value={sanctionReason}
                    onChange={(event) => setSanctionReason(event.target.value)}
                    placeholder="Motivo"
                    className="flex-1 rounded-2xl border border-white/10 bg-slate-900/90 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/70"
                  />
                </div>

                <button type="submit" className="rounded-3xl bg-rose-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-rose-400">Aplicar sanción</button>
              </form>
            </section>
          )}
        </div>
      </main>

      {!sessionLoading && !authorized && (
        <div className="fixed bottom-6 left-6 right-6 z-50 rounded-3xl border border-amber-400/20 bg-amber-500/10 px-5 py-4 text-sm text-amber-100 backdrop-blur-xl shadow-2xl shadow-amber-900/30 xl:left-auto xl:w-96">
          Necesitas iniciar sesión como operador o administrador para controlar reportes y sanciones.
        </div>
      )}

      <VisualSourcePopup
        source={selectedVisualSource}
        onClose={() => setSelectedVisualSource(null)}
      />
    </div>
  );
}
