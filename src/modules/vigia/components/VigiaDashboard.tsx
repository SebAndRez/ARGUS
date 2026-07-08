"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/hooks/useSession";
import { useUserLocation } from "@/hooks/useUserLocation";
import type { CrisisEvent } from "@/types/crisis";
import type { BaseMapType } from "@/types/map";
import type { VigiaReport, VigiaReportStatus } from "@/modules/vigia/types";
import { vigiaDemoReports } from "@/modules/vigia/data";
import {
  auditVigiaAction,
  canUseVigiaFeature,
  resolveVigiaModuleAccess,
  resolveVigiaRole,
} from "@/modules/vigia/vigiaAccess";
import { buildVigiaReputationSummary } from "@/modules/vigia/vigiaReputation";
import { evaluateVigiaReport } from "@/modules/vigia/vigiaValidation";
import { crisisEventToVigiaReport, getVigiaAtlasSummary, vigiaSeverityRank } from "@/modules/vigia/utils";

import VigiaHeader from "@/modules/vigia/components/VigiaHeader";
import VigiaReportForm, { type VigiaReportFormSubmitPayload } from "@/modules/vigia/components/VigiaReportForm";
import VigiaMapBridge from "@/modules/vigia/components/VigiaMapBridge";
import VigiaReportFeed from "@/modules/vigia/components/VigiaReportFeed";
import VigiaValidationPanel from "@/modules/vigia/components/VigiaValidationPanel";
import VigiaReputationPanel from "@/modules/vigia/components/VigiaReputationPanel";
import VigiaModerationQueue from "@/modules/vigia/components/VigiaModerationQueue";
import VigiaAccessDenied from "@/modules/vigia/components/VigiaAccessDenied";

const integrationTargets = [
  { id: "argus-atlas", label: "ATLAS", detail: "Resumen de reportes para el centro de mando." },
  { id: "argus-talos", label: "TALOS", detail: "Cálculo de riesgo y prioridad avanzados." },
  { id: "argus-oraculo", label: "ORÁCULO", detail: "Validación cruzada con fuentes abiertas." },
  { id: "argus-hermes", label: "HERMES", detail: "Rutas alternativas ante cortes/accidentes." },
  { id: "argus-aura", label: "AURA", detail: "Respuesta médica ante emergencias." },
  { id: "argus-arca", label: "ARCA", detail: "Refugios cercanos ante evacuación/daño." },
];

export default function VigiaDashboard() {
  const { user: sessionUser, loading: sessionLoading } = useSession();
  const location = useUserLocation();
  const [baseMapType] = useState<BaseMapType>("streets");

  const [apiReports, setApiReports] = useState<VigiaReport[]>([]);
  const [apiLoaded, setApiLoaded] = useState(false);
  const [statusOverrides, setStatusOverrides] = useState<Record<string, VigiaReportStatus>>({});
  const [selectedEvent, setSelectedEvent] = useState<CrisisEvent | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const vigiaRole = resolveVigiaRole(sessionUser);
  const moduleAccess = resolveVigiaModuleAccess(vigiaRole);

  useEffect(() => {
    if (!moduleAccess.canEnter || sessionLoading) return;
    auditVigiaAction({ userRole: vigiaRole, userId: sessionUser?.id, action: "module_view", reason: "vigia_dashboard_opened" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleAccess.canEnter, sessionLoading]);

  useEffect(() => {
    async function loadReports() {
      try {
        const res = await fetch("/api/events", { cache: "no-store" });
        const data = await res.json();
        const reportsOnly: CrisisEvent[] = (data.events ?? []).filter(
          (event: CrisisEvent) => event.type === "REPORT"
        );
        setApiReports(reportsOnly.map(crisisEventToVigiaReport));
      } catch {
        setStatusMessage("No se pudieron cargar los reportes ciudadanos en este momento.");
      } finally {
        setApiLoaded(true);
      }
    }
    loadReports();
  }, []);

  const isDemoData = apiLoaded && apiReports.length === 0;
  const baseReports = isDemoData ? vigiaDemoReports : apiReports;

  const reports = useMemo(
    () => baseReports.map((report) => ({ ...report, status: statusOverrides[report.id] ?? report.status })),
    [baseReports, statusOverrides]
  );

  const canCreateReport = canUseVigiaFeature(sessionUser, "create_report");
  const canValidate = canUseVigiaFeature(sessionUser, "validate_report");
  const canModerate = canUseVigiaFeature(sessionUser, "moderate_report");
  const showSensitiveDetails = canUseVigiaFeature(sessionUser, "view_sensitive_details");

  const summary = useMemo(() => getVigiaAtlasSummary(reports), [reports]);
  const criticalCount = summary.bySeverity.critical;

  const evaluations = useMemo(() => {
    const map: Record<string, ReturnType<typeof evaluateVigiaReport>> = {};
    reports.forEach((report) => {
      map[report.id] = evaluateVigiaReport(report, { allReports: reports });
    });
    return map;
  }, [reports]);

  const reputationSummary = useMemo(() => {
    const own = reports.filter((report) => report.reporter.alias === sessionUser?.publicAlias);
    return buildVigiaReputationSummary(
      sessionUser,
      own.length,
      own.filter((report) => report.status === "confirmed").length
    );
  }, [reports, sessionUser]);

  async function handleReportSubmit(payload: VigiaReportFormSubmitPayload) {
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: payload.type,
        title: payload.title || payload.type,
        description: payload.description,
        latitude: payload.location.lat,
        longitude: payload.location.lng,
        locationText: payload.location.isApproximate ? "Ubicación aproximada" : undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "No se pudo enviar el reporte.");

    setApiReports((current) => [crisisEventToVigiaReport({ ...data.report, type: "REPORT" }), ...current]);
    auditVigiaAction({
      reportId: data.report?.id,
      userId: sessionUser?.id,
      userRole: vigiaRole,
      action: "CREATE_REPORT",
      reason: payload.type,
    });
    setStatusMessage("Reporte enviado correctamente.");
  }

  function handleValidationDecision(reportId: string, status: VigiaReportStatus, action: string) {
    setStatusOverrides((current) => ({ ...current, [reportId]: status }));
    auditVigiaAction({ reportId, userId: sessionUser?.id, userRole: vigiaRole, action });
    setStatusMessage(`Reporte actualizado: ${action}`);
  }

  function handleSendTo(reportId: string, target: "oraculo" | "talos" | "atlas") {
    auditVigiaAction({
      reportId,
      userId: sessionUser?.id,
      userRole: vigiaRole,
      action: `SEND_TO_${target.toUpperCase()}`,
    });
    setStatusMessage(`Reporte enviado a ARGUS ${target.toUpperCase()} (preparado, no implementado aún).`);
  }

  function selectEventFromReport(report: VigiaReport) {
    setSelectedEvent({
      id: report.id,
      title: report.title,
      category: report.type,
      description: report.description,
      latitude: report.location.lat,
      longitude: report.location.lng,
      locationText: report.location.label ?? null,
      severity: report.severity.toUpperCase() as CrisisEvent["severity"],
      type: "REPORT",
      status: report.status,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
      author: report.reporter.alias,
      isDemo: report.isDemo,
    });
  }

  if (sessionLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
        <div className="border border-cyan-300/20 bg-slate-900/90 p-6 text-sm text-cyan-100">
          Cargando ARGUS VIGÍA...
        </div>
      </main>
    );
  }

  if (!moduleAccess.canView || !moduleAccess.canEnter) {
    return <VigiaAccessDenied userRole={vigiaRole} reason={moduleAccess.reason} />;
  }

  const reportsSorted = [...reports].sort(
    (a, b) => vigiaSeverityRank[b.severity] - vigiaSeverityRank[a.severity]
  );

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <VigiaHeader
        isDemoData={isDemoData}
        criticalCount={criticalCount}
        onNewReport={() => setIsFormOpen(true)}
        canCreateReport={canCreateReport}
      />

      <section className="grid gap-3 px-4 py-4 sm:px-6 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {[
          { label: "Activos", value: summary.total - summary.duplicates },
          { label: "Pendientes", value: summary.pending },
          { label: "Confirmados", value: summary.confirmed },
          { label: "Críticos", value: summary.critical },
          { label: "Con evidencia", value: summary.withEvidence },
          { label: "Posibles duplicados", value: summary.duplicates },
          { label: "Recientes (3h)", value: summary.recent },
        ].map((kpi) => (
          <div key={kpi.label} className="border border-white/10 bg-white/[0.02] p-3">
            <p className="text-[0.6rem] font-bold uppercase tracking-[0.14em] text-slate-400">{kpi.label}</p>
            <p className="mt-1 text-xl font-bold text-white">{kpi.value}</p>
          </div>
        ))}
      </section>

      {statusMessage && (
        <div className="mx-4 mb-3 border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100 sm:mx-6">
          {statusMessage}
        </div>
      )}

      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 backdrop-blur-sm sm:items-center sm:px-4 sm:py-6">
          <div className="max-h-full w-full max-w-xl overflow-y-auto border border-white/10 bg-slate-950/96 p-5 shadow-2xl shadow-black/50 sm:p-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Nuevo reporte VIGÍA</h2>
              <button type="button" onClick={() => setIsFormOpen(false)} className="text-slate-400 hover:text-white">
                Cerrar
              </button>
            </div>
            <VigiaReportForm
              location={{ latitude: location.latitude, longitude: location.longitude }}
              locationStatus={location.status}
              onRefreshLocation={location.refreshLocation}
              onSubmit={handleReportSubmit}
              canSubmit={canCreateReport}
              disabledReason={
                sessionUser
                  ? "Tu cuenta tiene reportes normales limitados por reputación."
                  : "Debes iniciar sesión para crear reportes."
              }
              onClose={() => setIsFormOpen(false)}
            />
          </div>
        </div>
      )}

      <main className="grid gap-4 px-4 pb-8 sm:px-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid gap-4 min-w-0">
          <VigiaMapBridge
            reports={reports}
            location={{ latitude: location.latitude, longitude: location.longitude }}
            locationStatus={location.status}
            selectedEventId={selectedEvent?.id}
            onEventSelect={setSelectedEvent}
            baseMapType={baseMapType}
          />

          {canValidate && (
            <VigiaValidationPanel
              reports={reportsSorted}
              evaluations={evaluations}
              onDecide={handleValidationDecision}
              onSendTo={handleSendTo}
            />
          )}

          {canModerate && <VigiaModerationQueue reports={reports} />}

          <section className="border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
            <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-cyan-300">
              VIGÍA alimenta a
            </h2>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {integrationTargets.map((target) => (
                <div key={target.id} className="border border-white/10 bg-white/[0.02] p-2.5">
                  <p className="text-xs font-bold uppercase text-cyan-200">{target.label}</p>
                  <p className="mt-1 text-[0.65rem] text-slate-400">{target.detail}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="grid min-w-0 auto-rows-max gap-4">
          <VigiaReputationPanel summary={reputationSummary} />
          <VigiaReportFeed
            reports={reportsSorted}
            onSelect={selectEventFromReport}
            showSensitiveDetails={showSensitiveDetails}
          />
        </div>
      </main>
    </div>
  );
}
