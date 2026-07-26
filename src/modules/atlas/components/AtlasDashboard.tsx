"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import DashboardCommandPanel from "@/components/dashboard/DashboardCommandPanel";
import CanonicalIncidentPanel from "@/components/modules/CanonicalIncidentPanel";
import OperationalContextPanel from "@/components/operationalContext/OperationalContextPanel";
import { useCanonicalModuleIncidents } from "@/hooks/useCanonicalModuleIncidents";
import { useOperationalContext } from "@/hooks/useOperationalContext";
import CommandCenterPanel from "@/components/command/CommandCenterPanel";
import EventDetailPanel from "@/components/map/EventDetailPanel";
import VisualSourcePopup from "@/components/map/VisualSourcePopup";
import DashboardUsersPanel from "@/components/dashboard/DashboardUsersPanel";
import LegalNoticeBanner from "@/components/legal/LegalNoticeBanner";
import type { LayerDisplayMeta, MapLayerState } from "@/components/map/MapLayerControls";
import { useUserLocation } from "@/hooks/useUserLocation";
import { useSession } from "@/hooks/useSession";
import { demoVisualSources } from "@/data/demoVisualSources";
import { demoRiskProjections } from "@/data/demoWeatherRisk";
import type { CrisisEvent } from "@/types/crisis";
import type { VisualSource } from "@/types/visualSource";
import type { BaseMapType } from "@/types/map";
import type { CommandSourceHealth } from "@/types/incident";
import { getCommandSourceHealth } from "@/lib/command/sourceHealthService";
import type { AtlasDecisionLogItem } from "@/modules/atlas/types";

import { auditAtlasAccess, resolveAtlasAccess, resolveAtlasRole } from "@/modules/atlas/atlasAccess";
import { atlasDemoDecisionLog, atlasDemoEvents } from "@/modules/atlas/data";
import {
  buildAtlasAlertQueue,
  buildAtlasCitizenReportsSummary,
  buildAtlasIncidentFeed,
  buildAtlasKpis,
  buildAtlasModuleStatuses,
  buildAtlasRiskSummary,
  buildAtlasSourceSummary,
} from "@/modules/atlas/atlasMetrics";
import { suggestModuleIdsForEvent } from "@/modules/atlas/utils";

import AtlasHeader from "@/modules/atlas/components/AtlasHeader";
import AtlasKpiGrid from "@/modules/atlas/components/AtlasKpiGrid";
import AtlasOperationalMapPanel from "@/modules/atlas/components/AtlasOperationalMapPanel";
import AtlasIncidentFeed from "@/modules/atlas/components/AtlasIncidentFeed";
import AtlasAlertQueue from "@/modules/atlas/components/AtlasAlertQueue";
import AtlasRiskPanel from "@/modules/atlas/components/AtlasRiskPanel";
import AtlasSourcePanel from "@/modules/atlas/components/AtlasSourcePanel";
import AtlasCitizenReportsPanel from "@/modules/atlas/components/AtlasCitizenReportsPanel";
import AtlasModuleStatusGrid from "@/modules/atlas/components/AtlasModuleStatusGrid";
import AtlasDecisionLog from "@/modules/atlas/components/AtlasDecisionLog";
import AtlasAccessDenied from "@/modules/atlas/components/AtlasAccessDenied";

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
  usgsShakeMapIntensity: false,
  usgsPagerImpactAssessment: false,
  openMeteoWeatherContext: false,
  smithsonianGvpVolcanoes: false,
  smithsonianGvpEruptionHistory: false,
  smithsonianUsgsVolcanicActivityReports: false,
  noaaNceiHistoricalTsunamis: false,
  openFemaDisasterDeclarations: false,
  osmCriticalInfrastructure: false,
  hdxHapiHumanitarianContext: false,
  whoDiseaseOutbreakNews: false,
  ecdcPublicHealthThreats: false,
  gdeltMediaSignals: false,
  copernicusGlofasFloodForecast: false,
  copernicusGfmObservedFloodExtent: false,
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

interface RawAuditLogItem {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: string | null;
  actorUserId?: string | null;
  createdAt: string;
}

const SANCTION_TYPES = ["WARNING", "LIMITATION", "SUSPENSION", "BAN", "RESTORE"] as const;

/**
 * ARGUS ATLAS: centro de mando operacional. Este componente reemplaza al
 * antiguo `DashboardPage` (ahora `/dashboard` solo renderiza esto) y agrega
 * la capa ejecutiva (KPIs, feed de incidentes, riesgo, fuentes, reportes
 * ciudadanos, bitácora y estado de módulos) sobre los mismos datos y
 * componentes reales que ya existían (mapa operacional, panel de comando,
 * panel de usuarios, auditoría, acciones de operador).
 */
export default function AtlasDashboard() {
  const { user: sessionUser, loading: sessionLoading } = useSession();
  const location = useUserLocation();
  const searchParams = useSearchParams();

  // Prompt 17 §10 — identidad de incidente canónico compartida entre
  // módulos: si se llega desde otro módulo con `?incidentId=`, queda
  // preseleccionado; nunca se serializa el incidente completo en la URL.
  const [selectedCanonicalIncidentId, setSelectedCanonicalIncidentId] = useState<string | null>(
    searchParams.get("incidentId")
  );
  const canonicalIncidents = useCanonicalModuleIncidents("argus-atlas", {});
  // ARGUS Operational Context Engine (Fase 12) — cuando el operador selecciona
  // un incidente canónico, ATLAS pasa automáticamente a modo operacional: se
  // resuelven y activan solas las capas relevantes (ver el useEffect más
  // abajo) y se muestra el panel de recursos priorizados, sin que el
  // operador tenga que buscarlos capa por capa.
  const operationalContext = useOperationalContext(selectedCanonicalIncidentId);

  const [events, setEvents] = useState<CrisisEvent[]>([]);
  const [eventsLoaded, setEventsLoaded] = useState(false);
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AtlasDecisionLogItem[] | null>(null);
  const [sources] = useState<CommandSourceHealth[]>(() => getCommandSourceHealth());
  const [selectedEvent, setSelectedEvent] = useState<CrisisEvent | null>(null);
  const [selectedVisualSource, setSelectedVisualSource] = useState<VisualSource | null>(null);
  const [layerSettings, setLayerSettings] = useState(initialLayers);
  const [baseMapType, setBaseMapType] = useState<BaseMapType>("streets");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [sanctionTarget, setSanctionTarget] = useState<string>("");
  const [sanctionType, setSanctionType] = useState<(typeof SANCTION_TYPES)[number]>("WARNING");
  const [sanctionReason, setSanctionReason] = useState("");

  const atlasRole = resolveAtlasRole(sessionUser);
  const atlasAccess = resolveAtlasAccess(atlasRole);
  // Sanciones/gestión de usuarios sigue restringida al chequeo original de
  // rol real (OPERATOR/ADMIN), independiente del acceso institucional a
  // ATLAS, para no ampliar accidentalmente ese permiso sensible.
  const operatorAuthorized = Boolean(
    sessionUser && ["OPERATOR", "ADMIN"].includes(sessionUser.role)
  );

  useEffect(() => {
    if (!atlasAccess.canEnter || sessionLoading) return;
    auditAtlasAccess(atlasRole, "module_view", "atlas_dashboard_opened");
    // Log once per resolved session, not on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atlasAccess.canEnter, sessionLoading]);

  // Fase 6 (Automatic Layer Activation): solo mezcla las capas que el motor
  // marcó relevantes para este incidente — nunca reemplaza el estado
  // completo de capas ni apaga lo que el operador ya tenía prendido.
  useEffect(() => {
    if (operationalContext?.state !== "available") return;
    const patch = operationalContext.data.layerActivationPatch;
    if (Object.keys(patch).length === 0) return;
    setLayerSettings((current) => ({ ...current, ...patch }));
  }, [operationalContext]);

  useEffect(() => {
    async function loadEvents() {
      try {
        const res = await fetch("/api/events", { cache: "no-store" });
        const data = await res.json();
        setEvents(data.events?.length ? data.events : []);
      } catch {
        setStatusMessage("No se pudieron cargar los eventos en este momento.");
      } finally {
        setEventsLoaded(true);
      }
    }
    loadEvents();
  }, []);

  useEffect(() => {
    if (!operatorAuthorized) return;

    async function loadUsers() {
      try {
        const usersRes = await fetch("/api/users", { cache: "no-store" });
        if (usersRes.ok) {
          const usersData = await usersRes.json();
          setUsers(usersData.users ?? []);
          if (usersData.users?.length > 0 && !sanctionTarget) {
            setSanctionTarget(usersData.users[0].id);
          }
        }
      } catch {
        setStatusMessage("No se pudieron cargar los usuarios institucionales.");
      }
    }
    loadUsers();
  }, [operatorAuthorized, sanctionTarget]);

  useEffect(() => {
    // Auditoría cruda: solo se expone a los mismos roles que ya tenían
    // acceso en el dashboard original (OPERATOR/ADMIN), aunque ATLAS admita
    // ANALYST/INSTITUTIONAL_ADMIN para el resto de la vista.
    if (!operatorAuthorized) return;

    async function loadAuditLogs() {
      try {
        const res = await fetch("/api/audit/logs", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const logs: RawAuditLogItem[] = data.logs ?? [];
        if (logs.length === 0) return;
        setAuditLogs(
          logs.slice(0, 12).map((log) => ({
            id: log.id,
            timestamp: log.createdAt,
            actor: log.actorUserId ?? "Sistema ARGUS",
            action: `${log.action} · ${log.targetType}`,
            module: "argus-atlas",
          }))
        );
      } catch {
        // Silencioso: la bitácora simplemente cae al set demo tipado.
      }
    }
    loadAuditLogs();
  }, [operatorAuthorized]);

  const isDemoData = eventsLoaded && events.length === 0;
  const effectiveEvents = isDemoData ? atlasDemoEvents : events;

  const gpsStatus = useMemo<"active" | "inactive" | "unknown">(() => {
    if (location.status === "granted") return "active";
    if (location.status === "loading" || location.status === "idle") return "unknown";
    return "inactive";
  }, [location.status]);

  const activeLayerCount = useMemo(
    () => Object.values(layerSettings).filter(Boolean).length,
    [layerSettings]
  );

  const incidentFeed = useMemo(() => buildAtlasIncidentFeed(effectiveEvents), [effectiveEvents]);
  const alertQueue = useMemo(() => buildAtlasAlertQueue(effectiveEvents), [effectiveEvents]);
  const riskSummary = useMemo(() => buildAtlasRiskSummary(effectiveEvents), [effectiveEvents]);
  const sourceSummary = useMemo(() => buildAtlasSourceSummary(sources), [sources]);
  const citizenReportsSummary = useMemo(
    () => buildAtlasCitizenReportsSummary(effectiveEvents),
    [effectiveEvents]
  );

  const recommendedModuleIds = useMemo(() => {
    const ids = new Set<string>();
    effectiveEvents.forEach((event) => {
      suggestModuleIdsForEvent(event, { userCanUseCustos: false }).forEach((id) => ids.add(id));
    });
    return Array.from(ids);
  }, [effectiveEvents]);

  const moduleStatuses = useMemo(
    () => buildAtlasModuleStatuses(atlasRole, recommendedModuleIds),
    [atlasRole, recommendedModuleIds]
  );

  const lastUpdatedIso = useMemo(() => {
    const timestamps = effectiveEvents
      .map((event) => event.updatedAt ?? event.createdAt)
      .filter(Boolean)
      .sort();
    return timestamps.at(-1) ?? null;
  }, [effectiveEvents]);

  const kpis = useMemo(
    () =>
      buildAtlasKpis(
        effectiveEvents,
        sourceSummary,
        moduleStatuses.filter((m) => m.status === "active" || m.status === "recommended").length,
        lastUpdatedIso
      ),
    [effectiveEvents, sourceSummary, moduleStatuses, lastUpdatedIso]
  );

  const decisionLogIsDemo = auditLogs === null;
  const decisionLogItems = auditLogs ?? atlasDemoDecisionLog;
  const criticalCount = useMemo(
    () => effectiveEvents.filter((e) => e.severity === "CRITICAL" && e.status !== "RESOLVED").length,
    [effectiveEvents]
  );

  /**
   * Prompt 17 §11 — entregable mínimo de ATLAS sobre datos canónicos:
   * activos, críticos activos, confirmados, candidatos, países afectados.
   * Nunca cuenta una evidencia/Source Health como amenaza territorial —
   * este resumen solo lee `ModuleIncidentSummary[]` del gateway canónico.
   */
  const canonicalIncidentSummary = useMemo(() => {
    if (!("data" in canonicalIncidents)) return null;
    const summaries = canonicalIncidents.data.summaries;
    const countries = new Set(summaries.map((s) => s.location.countryCode).filter((code): code is string => Boolean(code)));
    return {
      active: summaries.length,
      critical: summaries.filter((s) => s.severity === "critical").length,
      confirmed: summaries.filter((s) => s.verificationStatus === "official" || s.verificationStatus === "corroborated").length,
      candidates: summaries.filter((s) => s.verificationStatus === "candidate" || s.verificationStatus === "unverified").length,
      countries: countries.size,
    };
  }, [canonicalIncidents]);

  const layerMeta = useMemo<Partial<Record<keyof MapLayerState, LayerDisplayMeta>>>(
    () => ({
      reports: { count: effectiveEvents.filter((e) => e.type === "REPORT").length, detail: "Reportes ciudadanos" },
      sos: { count: effectiveEvents.filter((e) => e.type === "SOS").length, detail: "Solicitudes de ayuda" },
      alerts: { count: effectiveEvents.filter((e) => e.type === "ALERT").length, detail: "Alertas operacionales" },
      critical: { count: criticalCount, detail: "Prioridad critica activa" },
      resolved: { count: effectiveEvents.filter((e) => e.status === "RESOLVED").length, detail: "Eventos cerrados" },
      visualSources: { count: demoVisualSources.length, detail: "Fuentes de contexto", status: "ready" },
      weatherRisk: { count: demoRiskProjections.length, detail: "Zonas estimadas, no exactas", status: "ready" },
      user: {
        detail: gpsStatus === "active" ? "Posicion disponible" : "Ubicacion no confirmada",
        status: gpsStatus === "active" ? "ready" : "idle",
      },
    }),
    [criticalCount, effectiveEvents, gpsStatus]
  );

  const selectEvent = useCallback((event: CrisisEvent) => {
    setSelectedVisualSource(null);
    setSelectedEvent(event);
  }, []);

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
      const nextStatus = data.report?.status ?? data.helpRequest?.status ?? selectedEvent.status;
      setEvents((current) =>
        current.map((event) => (event.id === selectedEvent.id ? { ...event, status: nextStatus } : event))
      );
      setSelectedEvent((current) => (current?.id === selectedEvent.id ? { ...current, status: nextStatus } : current));
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
      setUsers((current) =>
        current.map((user) =>
          user.id === sanctionTarget
            ? { ...user, accountStatus: sanctionType === "RESTORE" ? "ACTIVE" : user.accountStatus }
            : user
        )
      );
    } catch (error) {
      setStatusMessage((error as Error).message);
    }
  }

  const toggleLayer = (key: keyof MapLayerState) => {
    setLayerSettings((current) => ({ ...current, [key]: !current[key] }));
  };

  if (sessionLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
        <div className="border border-cyan-300/20 bg-slate-900/90 p-6 text-sm text-cyan-100">
          Cargando ARGUS ATLAS...
        </div>
      </main>
    );
  }

  if (!atlasAccess.canView || !atlasAccess.canEnter) {
    return <AtlasAccessDenied userRole={atlasRole} reason={atlasAccess.reason} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <AtlasHeader userRole={atlasRole} isDemoData={isDemoData} criticalCount={criticalCount} />
      <div className="px-4 pt-3 sm:px-6">
        <LegalNoticeBanner />
      </div>

      <AtlasKpiGrid kpis={kpis} />

      {canonicalIncidentSummary && (
        <div className="mx-4 mb-3 grid grid-cols-2 gap-2 sm:mx-6 sm:grid-cols-5">
          {[
            { label: "Incidentes activos (canónico)", value: canonicalIncidentSummary.active },
            { label: "Críticos activos", value: canonicalIncidentSummary.critical },
            { label: "Confirmados", value: canonicalIncidentSummary.confirmed },
            { label: "Candidatos", value: canonicalIncidentSummary.candidates },
            { label: "Países afectados", value: canonicalIncidentSummary.countries },
          ].map((item) => (
            <div key={item.label} className="border border-white/10 bg-slate-950/85 px-3 py-2">
              <p className="text-lg font-semibold text-white">{item.value}</p>
              <p className="text-[0.6rem] uppercase tracking-wide text-slate-500">{item.label}</p>
            </div>
          ))}
        </div>
      )}

      {statusMessage && (
        <div className="mx-4 mb-3 border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100 sm:mx-6">
          {statusMessage}
        </div>
      )}

      <main className="grid gap-4 px-4 pb-8 sm:px-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid gap-4 min-w-0">
          <AtlasOperationalMapPanel
            events={effectiveEvents}
            selectedEventId={selectedEvent?.id}
            onEventSelect={selectEvent}
            location={{ latitude: location.latitude, longitude: location.longitude }}
            locationStatus={location.status}
            layerSettings={layerSettings}
            baseMapType={baseMapType}
            activeLayerCount={activeLayerCount}
          />

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <AtlasRiskPanel risk={riskSummary} />
            <AtlasSourcePanel summary={sourceSummary} />
            <AtlasCitizenReportsPanel summary={citizenReportsSummary} />
            <AtlasModuleStatusGrid modules={moduleStatuses} />
          </div>

          <AtlasDecisionLog items={decisionLogItems} isDemoData={decisionLogIsDemo} />
        </div>

        <div className="grid min-w-0 auto-rows-max gap-4">
          <div className="grid gap-2">
            <CanonicalIncidentPanel
              moduleId="argus-atlas"
              title="Incidentes canónicos (Global Watch/SENAPRED)"
              selectedIncidentId={selectedCanonicalIncidentId}
              onSelect={setSelectedCanonicalIncidentId}
            />
            {selectedCanonicalIncidentId && (
              <Link
                href={`/modules/vigia?incidentId=${encodeURIComponent(selectedCanonicalIncidentId)}`}
                className="text-[0.65rem] font-semibold uppercase tracking-wide text-cyan-300 hover:text-cyan-200"
              >
                Ver en VIGÍA →
              </Link>
            )}
          </div>
          {operationalContext && operationalContext.state !== "not_activated" && (
            <OperationalContextPanel result={operationalContext} />
          )}
          <AtlasIncidentFeed incidents={incidentFeed} onSelect={(incident) => incident.sourceEvent && selectEvent(incident.sourceEvent)} />
          <AtlasAlertQueue alerts={alertQueue} />
          <EventDetailPanel event={selectedEvent} onCenter={setSelectedEvent} />
        </div>
      </main>

      <div className="px-4 pb-8 sm:px-6">
        <DashboardCommandPanel
          events={effectiveEvents}
          layers={layerSettings}
          onToggleLayer={toggleLayer}
          baseMapType={baseMapType}
          onBaseMapChange={setBaseMapType}
          onSelectEvent={selectEvent}
          layerMeta={layerMeta}
        />
      </div>

      <div className="grid gap-4 px-4 pb-10 sm:px-6 lg:grid-cols-2">
        <CommandCenterPanel />

        {operatorAuthorized && (
          <section className="border border-white/10 bg-slate-950/85 p-5 shadow-2xl shadow-black/30">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/75">Control rápido</p>
                <h2 className="mt-1 text-lg font-semibold text-white">Acciones del operador</h2>
              </div>
            </div>

            {selectedEvent ? (
              <div className="grid gap-3">
                <p className="text-sm text-slate-400">Acciones disponibles para el evento seleccionado.</p>
                <div className="flex flex-wrap gap-2">
                  {(selectedEvent.type === "REPORT"
                    ? [
                        { label: "Validar", action: "VALIDATE" },
                        { label: "Descartar", action: "DISCARD" },
                        { label: "Falso", action: "FALSE" },
                        { label: "Escalar", action: "ESCALATE" },
                        { label: "Resolver", action: "RESOLVE" },
                      ]
                    : [
                        { label: "Revisar", action: "REVIEW" },
                        { label: "Asignar", action: "ASSIGN" },
                        { label: "Resolver", action: "RESOLVE" },
                        { label: "Cancelar", action: "CANCEL" },
                      ]
                  ).map((item) => (
                    <button
                      key={item.action}
                      type="button"
                      onClick={() => handleEventAction(item.action)}
                      className="bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-cyan-400"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Selecciona un evento para ver acciones rápidas.</p>
            )}

            <form onSubmit={handleSanctionSubmit} className="mt-5 grid gap-3">
              <label className="grid gap-1.5 text-xs text-slate-300">
                Objetivo de sanción
                <select
                  value={sanctionTarget}
                  onChange={(event) => setSanctionTarget(event.target.value)}
                  className="border border-white/10 bg-slate-900/90 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/70"
                >
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.publicAlias} · {user.accountStatus}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex gap-2">
                <select
                  value={sanctionType}
                  onChange={(event) => setSanctionType(event.target.value as (typeof SANCTION_TYPES)[number])}
                  className="flex-1 border border-white/10 bg-slate-900/90 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/70"
                >
                  {SANCTION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
                <input
                  value={sanctionReason}
                  onChange={(event) => setSanctionReason(event.target.value)}
                  placeholder="Motivo"
                  className="flex-1 border border-white/10 bg-slate-900/90 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/70"
                />
              </div>

              <button
                type="submit"
                className="bg-rose-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-rose-400"
              >
                Aplicar sanción
              </button>
            </form>
          </section>
        )}

        {operatorAuthorized && <DashboardUsersPanel users={users} />}
      </div>

      <VisualSourcePopup source={selectedVisualSource} onClose={() => setSelectedVisualSource(null)} />
    </div>
  );
}
