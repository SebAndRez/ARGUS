"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "@/hooks/useSession";
import TalosCanonicalIncidentPanel from "@/modules/talos/components/TalosCanonicalIncidentPanel";
import type { CrisisEvent } from "@/types/crisis";
import type { TalosRiskAssessment } from "@/modules/talos/types";
import { talosDemoAssessments } from "@/modules/talos/data";
import { calculateTalosRiskAssessment } from "@/modules/talos/talosScoring";
import { crisisEventToVigiaReport } from "@/modules/vigia/utils";
import { convertVigiaReportsToTalosSignals } from "@/modules/talos/talosVigiaBridge";
import { getTalosAtlasSummary } from "@/modules/talos/talosAtlasBridge";
import { prepareTalosSignalsForFenix } from "@/modules/talos/talosModuleBridges";
import { resolveTalosModuleAccess, resolveTalosRole, canUseTalosFeature } from "@/modules/talos/talosAccess";
import { auditTalosAction } from "@/modules/talos/talosAudit";
import { formatTalosRelativeTime, mapCrisisCategoryToTalosCategory, talosRiskLevelLabel } from "@/modules/talos/utils";

import TalosHeader from "@/modules/talos/components/TalosHeader";
import TalosKpiGrid from "@/modules/talos/components/TalosKpiGrid";
import TalosRiskMatrixPanel from "@/modules/talos/components/TalosRiskMatrixPanel";
import TalosIncidentRiskFeed from "@/modules/talos/components/TalosIncidentRiskFeed";
import TalosPriorityQueue from "@/modules/talos/components/TalosPriorityQueue";
import TalosExplanationPanel from "@/modules/talos/components/TalosExplanationPanel";
import TalosModuleRecommendationPanel from "@/modules/talos/components/TalosModuleRecommendationPanel";
import TalosScenarioPreviewPanel from "@/modules/talos/components/TalosScenarioPreviewPanel";
import TalosAccessDenied from "@/modules/talos/components/TalosAccessDenied";

export default function TalosDashboard() {
  const { user: sessionUser, loading: sessionLoading } = useSession();
  const searchParams = useSearchParams();
  const [selectedCanonicalIncidentId, setSelectedCanonicalIncidentId] = useState<string | null>(
    searchParams.get("incidentId")
  );

  const [apiAssessments, setApiAssessments] = useState<TalosRiskAssessment[]>([]);
  const [apiLoaded, setApiLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const talosRole = resolveTalosRole(sessionUser);
  const moduleAccess = resolveTalosModuleAccess(talosRole);
  const canViewDashboard = canUseTalosFeature(sessionUser, "view_dashboard");
  const canViewPublicSummary = canUseTalosFeature(sessionUser, "view_public_summary");
  const canSend = canUseTalosFeature(sessionUser, "send_to_atlas") || canUseTalosFeature(sessionUser, "send_to_fenix");

  useEffect(() => {
    if (!moduleAccess.canEnter || sessionLoading) return;
    auditTalosAction({ userRole: talosRole, userId: sessionUser?.id, action: "module_view", reason: "talos_dashboard_opened" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleAccess.canEnter, sessionLoading]);

  useEffect(() => {
    async function loadEvents() {
      try {
        const res = await fetch("/api/events", { cache: "no-store" });
        const data = await res.json();
        const events: CrisisEvent[] = (data.events ?? []).filter((event: CrisisEvent) => event.status !== "RESOLVED");
        const assessments = events.map((event) => {
          const isCitizenReport = event.type === "REPORT";
          const vigiaSignal = isCitizenReport
            ? convertVigiaReportsToTalosSignals([crisisEventToVigiaReport(event)])
            : undefined;
          return calculateTalosRiskAssessment({
            event: {
              id: event.id,
              title: event.title,
              category: mapCrisisCategoryToTalosCategory(event.category),
              severity: event.severity,
              status: event.status,
              createdAt: event.createdAt,
              updatedAt: event.updatedAt,
              location: { lat: event.latitude, lng: event.longitude, label: event.locationText ?? undefined },
            },
            vigiaSignal,
          });
        });
        setApiAssessments(assessments);
      } catch {
        setStatusMessage("No se pudieron cargar eventos para evaluar riesgo en este momento.");
      } finally {
        setApiLoaded(true);
      }
    }
    loadEvents();
  }, []);

  const isDemoData = apiLoaded && apiAssessments.length === 0;
  const assessments = isDemoData ? talosDemoAssessments : apiAssessments;

  const selected = assessments.find((a) => a.id === selectedId) ?? null;

  const atlasSummary = useMemo(() => getTalosAtlasSummary(assessments), [assessments]);

  const criticalCount = assessments.filter((a) => a.riskLevel === "critical").length;
  const highConfidenceCount = assessments.filter((a) => a.confidence === "high" || a.confidence === "verified").length;
  const lowConfidenceCount = assessments.filter((a) => a.confidence === "unknown" || a.confidence === "low").length;
  const averageRiskLabel =
    assessments.length > 0
      ? talosRiskLevelLabel[
          (["critical", "high", "medium", "low", "minimal"] as const).find(
            (level) => assessments.filter((a) => a.riskLevel === level).length >= assessments.length / 2
          ) ?? "medium"
        ]
      : "—";

  const lastUpdatedIso = useMemo(() => {
    const timestamps = assessments.map((a) => a.updatedAt).sort();
    return timestamps.at(-1) ?? null;
  }, [assessments]);

  function handleSendToAtlas() {
    auditTalosAction({ userId: sessionUser?.id, userRole: talosRole, action: "SEND_TO_ATLAS" });
    setStatusMessage("Resumen TALOS enviado a ATLAS (preparado, no implementado aún).");
  }

  function handleSendToFenix() {
    if (!selected) return;
    const packet = prepareTalosSignalsForFenix(selected);
    auditTalosAction({ userId: sessionUser?.id, userRole: talosRole, action: "SEND_TO_FENIX", assessmentId: selected.id });
    setStatusMessage(
      `Evaluación preparada para FÉNIX (sin simular): ${packet.missingData.length > 0 ? packet.missingData.join(" ") : "datos completos."}`
    );
  }

  function handleSelect(assessment: TalosRiskAssessment) {
    setSelectedId(assessment.id);
    if (canUseTalosFeature(sessionUser, "view_explanations")) {
      auditTalosAction({ userId: sessionUser?.id, userRole: talosRole, action: "VIEW_EXPLANATION", assessmentId: assessment.id });
    }
  }

  if (sessionLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
        <div className="border border-fuchsia-300/20 bg-slate-900/90 p-6 text-sm text-fuchsia-100">
          Cargando ARGUS TALOS...
        </div>
      </main>
    );
  }

  if (!moduleAccess.canView || !moduleAccess.canEnter) {
    return <TalosAccessDenied userRole={talosRole} reason={moduleAccess.reason} />;
  }

  // Usuario público/verificado: solo resultados simples, sin panel analítico.
  if (!canViewDashboard) {
    if (!canViewPublicSummary) {
      return <TalosAccessDenied userRole={talosRole} reason="TALOS no está disponible para este perfil." />;
    }
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-10 text-white sm:px-8">
        <div className="mx-auto max-w-2xl">
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.24em] text-fuchsia-300">ARGUS TALOS</p>
          <h1 className="mt-2 text-2xl font-bold uppercase tracking-[0.06em]">Riesgo cercano a tu zona</h1>
          <p className="mt-2 text-sm text-slate-400">
            El panel analítico completo está reservado para analistas e instituciones. Estos son resultados simples,
            derivados del motor de riesgo, sin factores internos ni fuentes detalladas.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {assessments.slice(0, 6).map((assessment) => (
              <div key={assessment.id} className="border border-white/10 bg-white/[0.02] p-3">
                <p className="text-sm font-semibold text-white">{assessment.title}</p>
                <p className="mt-1 text-xs text-slate-400">{talosRiskLevelLabel[assessment.riskLevel]}</p>
              </div>
            ))}
            {assessments.length === 0 && <p className="text-sm text-slate-500">Sin evaluaciones disponibles.</p>}
          </div>
          <a href="/modules" className="mt-6 inline-block text-xs font-semibold uppercase text-fuchsia-300 hover:text-fuchsia-200">
            ← Volver a módulos
          </a>
        </div>
      </main>
    );
  }

  const kpis = [
    { label: "Eventos evaluados", value: assessments.length },
    { label: "Eventos críticos", value: criticalCount },
    { label: "Riesgo predominante", value: averageRiskLabel },
    { label: "Confianza alta", value: highConfidenceCount },
    { label: "Confianza baja", value: lowConfidenceCount },
    { label: "Contradicciones abiertas", value: atlasSummary.eventsWithContradictions },
    { label: "Módulos recomendados", value: atlasSummary.recommendedModules.length },
    { label: "Última actualización", value: formatTalosRelativeTime(lastUpdatedIso) },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <TalosHeader isDemoData={isDemoData} criticalCount={criticalCount} userRole={talosRole} />
      <TalosKpiGrid kpis={kpis} />

      {statusMessage && (
        <div className="mx-4 mb-3 border border-fuchsia-400/20 bg-fuchsia-500/10 px-4 py-3 text-sm text-fuchsia-100 sm:mx-6">
          {statusMessage}
        </div>
      )}

      <main className="grid gap-4 px-4 pb-8 sm:px-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-4 min-w-0">
          <TalosCanonicalIncidentPanel
            selectedIncidentId={selectedCanonicalIncidentId}
            onSelect={setSelectedCanonicalIncidentId}
          />
          <TalosRiskMatrixPanel assessments={assessments} />
          <TalosPriorityQueue assessments={assessments} onSelect={handleSelect} />
          <TalosIncidentRiskFeed assessments={assessments} onSelect={handleSelect} />

          {canSend && (
            <section className="border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleSendToAtlas}
                  className="border border-cyan-300/30 bg-cyan-400/10 px-3 py-1.5 text-[0.62rem] font-bold uppercase text-cyan-100"
                >
                  Enviar resumen a ATLAS
                </button>
                <button
                  type="button"
                  onClick={handleSendToFenix}
                  disabled={!selected}
                  className="border border-violet-300/30 bg-violet-400/10 px-3 py-1.5 text-[0.62rem] font-bold uppercase text-violet-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Preparar evaluación para FÉNIX
                </button>
              </div>
            </section>
          )}
        </div>

        <div className="grid min-w-0 auto-rows-max gap-4">
          <TalosExplanationPanel assessment={selected} />
          <TalosModuleRecommendationPanel recommendations={selected?.recommendations ?? []} />
          <TalosScenarioPreviewPanel />
        </div>
      </main>
    </div>
  );
}
