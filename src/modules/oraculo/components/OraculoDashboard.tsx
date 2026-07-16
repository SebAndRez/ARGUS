"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "@/hooks/useSession";
import OraculoCanonicalIncidentPanel from "@/modules/oraculo/components/OraculoCanonicalIncidentPanel";
import type { CrisisEvent } from "@/types/crisis";
import type { OraculoEvidence, OraculoVerificationStatus } from "@/modules/oraculo/types";
import { oraculoDemoEvidence } from "@/modules/oraculo/data";
import { oraculoSourceRegistry, getOraculoSourceById } from "@/modules/oraculo/oraculoSourceRegistry";
import { calculateOraculoReliabilityScore } from "@/modules/oraculo/oraculoScoring";
import { detectOraculoContradictions } from "@/modules/oraculo/oraculoContradictions";
import {
  convertVigiaReportToOraculoEvidence,
  getOraculoAtlasSummary,
  prepareEvidenceForFenixScenario,
  prepareEvidenceForTalos,
} from "@/modules/oraculo/oraculoEvidence";
import {
  canUseOraculoFeature,
  resolveOraculoModuleAccess,
  resolveOraculoRole,
} from "@/modules/oraculo/oraculoAccess";
import { auditOraculoAction } from "@/modules/oraculo/oraculoAudit";
import { crisisEventToVigiaReport } from "@/modules/vigia/utils";
import { formatOraculoRelativeTime } from "@/modules/oraculo/utils";

import OraculoHeader from "@/modules/oraculo/components/OraculoHeader";
import OraculoKpiGrid from "@/modules/oraculo/components/OraculoKpiGrid";
import OraculoSourceRegistryPanel from "@/modules/oraculo/components/OraculoSourceRegistryPanel";
import OraculoEvidenceFeed from "@/modules/oraculo/components/OraculoEvidenceFeed";
import OraculoConfidencePanel from "@/modules/oraculo/components/OraculoConfidencePanel";
import OraculoContradictionPanel from "@/modules/oraculo/components/OraculoContradictionPanel";
import OraculoEventTracePanel from "@/modules/oraculo/components/OraculoEventTracePanel";
import OraculoSourceHealthPanel from "@/modules/oraculo/components/OraculoSourceHealthPanel";
import OraculoIntegrationPanel from "@/modules/oraculo/components/OraculoIntegrationPanel";
import OraculoAccessDenied from "@/modules/oraculo/components/OraculoAccessDenied";

export default function OraculoDashboard() {
  const { user: sessionUser, loading: sessionLoading } = useSession();
  const searchParams = useSearchParams();
  const [selectedCanonicalIncidentId, setSelectedCanonicalIncidentId] = useState<string | null>(
    searchParams.get("incidentId")
  );

  const [vigiaEvidence, setVigiaEvidence] = useState<OraculoEvidence[]>([]);
  const [apiLoaded, setApiLoaded] = useState(false);
  const [verificationOverrides, setVerificationOverrides] = useState<Record<string, OraculoVerificationStatus>>({});
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const oraculoRole = resolveOraculoRole(sessionUser);
  const moduleAccess = resolveOraculoModuleAccess(oraculoRole);

  useEffect(() => {
    if (!moduleAccess.canEnter || sessionLoading) return;
    auditOraculoAction({ userRole: oraculoRole, userId: sessionUser?.id, action: "module_view", reason: "oraculo_dashboard_opened" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleAccess.canEnter, sessionLoading]);

  useEffect(() => {
    async function loadVigiaEvidence() {
      try {
        const res = await fetch("/api/events", { cache: "no-store" });
        const data = await res.json();
        const reportsOnly: CrisisEvent[] = (data.events ?? []).filter((event: CrisisEvent) => event.type === "REPORT");
        const converted = reportsOnly
          .map((event) => convertVigiaReportToOraculoEvidence(crisisEventToVigiaReport(event)))
          .filter((evidence): evidence is OraculoEvidence => evidence !== null);
        setVigiaEvidence(converted);
      } catch {
        setStatusMessage("No se pudo cargar evidencia ciudadana en este momento.");
      } finally {
        setApiLoaded(true);
      }
    }
    loadVigiaEvidence();
  }, []);

  const isDemoData = apiLoaded && vigiaEvidence.length === 0;
  const evidenceList = useMemo(() => {
    const base = isDemoData ? oraculoDemoEvidence : vigiaEvidence;
    return base.map((evidence) => ({
      ...evidence,
      verificationStatus: verificationOverrides[evidence.id] ?? evidence.verificationStatus,
    }));
  }, [isDemoData, vigiaEvidence, verificationOverrides]);

  const contradictions = useMemo(() => detectOraculoContradictions(evidenceList), [evidenceList]);

  const contradictionStatusById = useMemo(() => {
    const map: Record<string, "none" | "possible" | "requires_review"> = {};
    contradictions.forEach((contradiction) => {
      contradiction.evidenceIds.forEach((id) => {
        map[id] = contradiction.requiresHumanReview ? "requires_review" : "possible";
      });
    });
    return map;
  }, [contradictions]);

  const evidenceWithContradictionStatus = useMemo(
    () =>
      evidenceList.map((evidence) => ({
        ...evidence,
        contradictionStatus: contradictionStatusById[evidence.id] ?? evidence.contradictionStatus,
      })),
    [evidenceList, contradictionStatusById]
  );

  const scores = useMemo(() => {
    const map: Record<string, ReturnType<typeof calculateOraculoReliabilityScore>> = {};
    evidenceWithContradictionStatus.forEach((evidence) => {
      const source = getOraculoSourceById(evidence.sourceId);
      map[evidence.id] = calculateOraculoReliabilityScore(evidence, source, evidenceWithContradictionStatus);
    });
    return map;
  }, [evidenceWithContradictionStatus]);

  const canViewFullPanel = canUseOraculoFeature(sessionUser, "view_dashboard");
  const canSend = canUseOraculoFeature(sessionUser, "send_to_talos") || canUseOraculoFeature(sessionUser, "send_to_atlas");

  const atlasSummary = useMemo(
    () => getOraculoAtlasSummary(evidenceWithContradictionStatus, oraculoSourceRegistry, contradictions),
    [evidenceWithContradictionStatus, contradictions]
  );

  const talosPacket = useMemo(
    () => prepareEvidenceForTalos(evidenceWithContradictionStatus, contradictions),
    [evidenceWithContradictionStatus, contradictions]
  );
  const fenixPacket = useMemo(
    () => prepareEvidenceForFenixScenario(evidenceWithContradictionStatus),
    [evidenceWithContradictionStatus]
  );

  const lastUpdatedIso = useMemo(() => {
    const timestamps = evidenceWithContradictionStatus.map((e) => e.collectedAt).sort();
    return timestamps.at(-1) ?? null;
  }, [evidenceWithContradictionStatus]);

  const selectedEvidence = evidenceWithContradictionStatus.find((e) => e.id === selectedEvidenceId) ?? null;

  const canVerify = canUseOraculoFeature(sessionUser, "verify_evidence");
  const canReject = canUseOraculoFeature(sessionUser, "reject_evidence");

  function handleVerifyEvidence(evidenceId: string) {
    setVerificationOverrides((current) => ({ ...current, [evidenceId]: "verified" }));
    auditOraculoAction({ userId: sessionUser?.id, userRole: oraculoRole, action: "VERIFY_EVIDENCE", evidenceId });
    setStatusMessage("Evidencia marcada como verificada.");
  }

  function handleRejectEvidence(evidenceId: string) {
    setVerificationOverrides((current) => ({ ...current, [evidenceId]: "rejected" }));
    auditOraculoAction({ userId: sessionUser?.id, userRole: oraculoRole, action: "REJECT_EVIDENCE", evidenceId });
    setStatusMessage("Evidencia marcada como rechazada.");
  }

  function handleSendToTalos() {
    auditOraculoAction({ userId: sessionUser?.id, userRole: oraculoRole, action: "SEND_TO_TALOS" });
    setStatusMessage(`${talosPacket.length} evidencia(s) preparadas y enviadas a TALOS (preparado, no implementado aún).`);
  }

  function handleSendToAtlas() {
    auditOraculoAction({ userId: sessionUser?.id, userRole: oraculoRole, action: "SEND_TO_ATLAS" });
    setStatusMessage("Resumen ORÁCULO enviado a ATLAS (preparado, no implementado aún).");
  }

  if (sessionLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
        <div className="border border-violet-300/20 bg-slate-900/90 p-6 text-sm text-violet-100">
          Cargando ARGUS ORÁCULO...
        </div>
      </main>
    );
  }

  if (!moduleAccess.canView || !moduleAccess.canEnter || !canViewFullPanel) {
    return <OraculoAccessDenied userRole={oraculoRole} reason={moduleAccess.reason} />;
  }

  const verifiedCount = evidenceWithContradictionStatus.filter((e) => e.verificationStatus === "verified").length;
  const pendingCount = evidenceWithContradictionStatus.filter(
    (e) => e.verificationStatus === "unverified" || e.verificationStatus === "pending_review"
  ).length;
  const legalReviewSourceCount = oraculoSourceRegistry.filter((source) => source.requiresLicenseReview).length;

  const kpis = [
    { label: "Fuentes registradas", value: oraculoSourceRegistry.length },
    { label: "Fuentes activas", value: atlasSummary.activeSources },
    { label: "Evidencias recolectadas", value: evidenceWithContradictionStatus.length },
    { label: "Evidencias verificadas", value: verifiedCount },
    { label: "Evidencias pendientes", value: pendingCount },
    { label: "Contradicciones detectadas", value: contradictions.length },
    { label: "Revisión legal/comercial", value: legalReviewSourceCount },
    { label: "Última actualización", value: formatOraculoRelativeTime(lastUpdatedIso) },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <OraculoHeader isDemoData={isDemoData} contradictionCount={contradictions.length} userRole={oraculoRole} />
      <OraculoKpiGrid kpis={kpis} />

      {statusMessage && (
        <div className="mx-4 mb-3 border border-violet-400/20 bg-violet-500/10 px-4 py-3 text-sm text-violet-100 sm:mx-6">
          {statusMessage}
        </div>
      )}

      <main className="grid gap-4 px-4 pb-8 sm:px-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-4 min-w-0">
          <OraculoCanonicalIncidentPanel
            selectedIncidentId={selectedCanonicalIncidentId}
            onSelect={setSelectedCanonicalIncidentId}
          />
          <OraculoSourceRegistryPanel sources={oraculoSourceRegistry} />
          <div className="grid gap-4 sm:grid-cols-2">
            <OraculoSourceHealthPanel sources={oraculoSourceRegistry} />
            <OraculoContradictionPanel contradictions={contradictions} />
          </div>
          <OraculoIntegrationPanel
            onSendToTalos={handleSendToTalos}
            onSendToAtlas={handleSendToAtlas}
            canSend={canSend}
            talosPacketCount={talosPacket.length}
            fenixPacketCount={fenixPacket.length}
          />
        </div>

        <div className="grid min-w-0 auto-rows-max gap-4">
          <OraculoEvidenceFeed
            evidenceList={evidenceWithContradictionStatus}
            scores={scores}
            onSelect={(evidence) => setSelectedEvidenceId(evidence.id)}
          />
          <OraculoConfidencePanel
            evidence={selectedEvidence}
            result={selectedEvidence ? scores[selectedEvidence.id] : null}
            canVerify={canVerify}
            canReject={canReject}
            onVerify={handleVerifyEvidence}
            onReject={handleRejectEvidence}
          />
          <OraculoEventTracePanel evidence={selectedEvidence} allEvidence={evidenceWithContradictionStatus} />
        </div>
      </main>
    </div>
  );
}
