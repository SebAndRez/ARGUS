"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/hooks/useSession";
import { useUserLocation } from "@/hooks/useUserLocation";
import type { CrisisEvent } from "@/types/crisis";
import type { ArcaShelter } from "@/modules/arca/types";
import { arcaDemoShelters } from "@/modules/arca/data";
import { crisisEventToVigiaReport } from "@/modules/vigia/utils";
import { convertVigiaReportsToArcaSignals } from "@/modules/arca/arcaVigiaBridge";
import { getArcaAtlasSummary } from "@/modules/arca/arcaAtlasBridge";
import { calculateArcaCapacityStatus } from "@/modules/arca/arcaCapacity";
import { resolveArcaModuleAccess, resolveArcaRole, canUseArcaFeature } from "@/modules/arca/arcaAccess";
import { auditArcaAction } from "@/modules/arca/arcaAudit";
import { formatArcaRelativeTime } from "@/modules/arca/utils";
import { getModuleById } from "@/data/argusModules";
import { calculateHermesRoutes } from "@/modules/hermes/hermesRouting";
import type { HermesRoute } from "@/modules/hermes/types";

import ArcaHeader from "@/modules/arca/components/ArcaHeader";
import ArcaKpiGrid from "@/modules/arca/components/ArcaKpiGrid";
import ArcaShelterMapPanel from "@/modules/arca/components/ArcaShelterMapPanel";
import ArcaShelterList from "@/modules/arca/components/ArcaShelterList";
import ArcaShelterDetailPanel from "@/modules/arca/components/ArcaShelterDetailPanel";
import ArcaNeedsPanel from "@/modules/arca/components/ArcaNeedsPanel";
import ArcaNearbySheltersPanel from "@/modules/arca/components/ArcaNearbySheltersPanel";
import ArcaIntegrationPanel from "@/modules/arca/components/ArcaIntegrationPanel";
import ArcaAccessDenied from "@/modules/arca/components/ArcaAccessDenied";

export default function ArcaDashboard() {
  const { user: sessionUser, loading: sessionLoading } = useSession();
  const location = useUserLocation();

  const [vigiaSignalCount, setVigiaSignalCount] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [routeResult, setRouteResult] = useState<{ shelterId: string; route: HermesRoute } | null>(null);
  const [isRouting, setIsRouting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const arcaRole = resolveArcaRole(sessionUser);
  const moduleAccess = resolveArcaModuleAccess(arcaRole);
  const canViewDetailedCapacity = canUseArcaFeature(sessionUser, "view_detailed_capacity");
  const canViewInternalNotes = canUseArcaFeature(sessionUser, "view_internal_notes");
  const canViewNeeds = canUseArcaFeature(sessionUser, "view_needs");
  const canPlanRoute = canUseArcaFeature(sessionUser, "send_to_hermes");
  const arcaModule = getModuleById("argus-arca");

  useEffect(() => {
    if (!moduleAccess.canEnter || sessionLoading) return;
    auditArcaAction({ userRole: arcaRole, userId: sessionUser?.id, action: "module_view", reason: "arca_dashboard_opened" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleAccess.canEnter, sessionLoading]);

  useEffect(() => {
    async function loadVigiaSignals() {
      try {
        const res = await fetch("/api/events", { cache: "no-store" });
        const data = await res.json();
        const reportsOnly: CrisisEvent[] = (data.events ?? []).filter((event: CrisisEvent) => event.type === "REPORT");
        const signals = convertVigiaReportsToArcaSignals(reportsOnly.map(crisisEventToVigiaReport));
        setVigiaSignalCount(signals.length);
      } catch {
        // Silencioso: los reportes ciudadanos son un complemento, no bloquean el panel de refugios.
      }
    }
    loadVigiaSignals();
  }, []);

  // ARCA todavía no tiene backend real de refugios (`/api/arca/shelters`
  // preparado a futuro); usa siempre el set demo tipado, marcado como tal.
  const shelters: ArcaShelter[] = arcaDemoShelters;
  const isDemoData = true;

  const selectedShelter = shelters.find((shelter) => shelter.id === selectedId) ?? null;
  const atlasSummary = useMemo(() => getArcaAtlasSummary(shelters), [shelters]);
  const saturatedCount = shelters.filter((shelter) => ["full", "over_capacity"].includes(calculateArcaCapacityStatus(shelter))).length;

  async function handlePlanRoute(shelter: ArcaShelter) {
    setIsRouting(true);
    setStatusMessage(null);
    try {
      const routes = await calculateHermesRoutes({
        origin: { lat: location.latitude, lng: location.longitude },
        destination: shelter.location,
        mobilityMode: "car",
        purpose: "shelter_access",
      });
      setRouteResult({ shelterId: shelter.id, route: routes[0] });
      setSelectedId(shelter.id);
      auditArcaAction({ userId: sessionUser?.id, userRole: arcaRole, action: "SEND_TO_HERMES", shelterId: shelter.id });
    } catch {
      setStatusMessage("No se pudo calcular una ruta hacia el refugio en este momento.");
    } finally {
      setIsRouting(false);
    }
  }

  if (sessionLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
        <div className="border border-emerald-300/20 bg-slate-900/90 p-6 text-sm text-emerald-100">Cargando ARGUS ARCA...</div>
      </main>
    );
  }

  if (!moduleAccess.canView || !moduleAccess.canEnter) {
    return <ArcaAccessDenied userRole={arcaRole} reason={moduleAccess.reason} />;
  }

  const kpis = [
    { label: "Refugios activos", value: atlasSummary.activeShelters },
    { label: "Con capacidad", value: shelters.filter((s) => calculateArcaCapacityStatus(s) === "available").length },
    { label: "Refugios llenos", value: atlasSummary.saturatedShelters },
    { label: "Capacidad total est.", value: atlasSummary.estimatedTotalCapacity },
    { label: "Ocupación estimada", value: atlasSummary.estimatedOccupancy },
    { label: "Necesidades críticas", value: atlasSummary.criticalNeeds },
    { label: "Con punto médico", value: atlasSummary.sheltersWithMedicalPoint },
    { label: "Última actualización", value: formatArcaRelativeTime(atlasSummary.lastUpdatedIso) },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <ArcaHeader isDemoData={isDemoData} saturatedCount={saturatedCount} userRole={arcaRole} maturity={arcaModule?.maturity} />
      <ArcaKpiGrid kpis={kpis} />

      {vigiaSignalCount > 0 && (
        <div className="mx-4 mb-3 border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100 sm:mx-6">
          {vigiaSignalCount} reporte(s) ciudadano(s) de VIGÍA relacionados con refugios detectados (agua, capacidad, acceso, etc.).
        </div>
      )}

      {statusMessage && (
        <div className="mx-4 mb-3 border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100 sm:mx-6">{statusMessage}</div>
      )}

      <main className="grid gap-4 px-4 pb-8 sm:px-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-4 min-w-0">
          <ArcaShelterMapPanel shelters={shelters} selected={selectedShelter} />
          <ArcaShelterList
            shelters={shelters}
            userLocation={{ lat: location.latitude, lng: location.longitude }}
            onSelect={(shelter) => setSelectedId(shelter.id)}
            onPlanRoute={handlePlanRoute}
            canPlanRoute={canPlanRoute}
          />
          {canViewNeeds && <ArcaNeedsPanel shelters={shelters} />}
          <ArcaNearbySheltersPanel
            shelters={shelters}
            userLocation={{ lat: location.latitude, lng: location.longitude }}
            onPlanRoute={handlePlanRoute}
            canPlanRoute={canPlanRoute}
          />
          <ArcaIntegrationPanel />
        </div>

        <div className="grid min-w-0 auto-rows-max gap-4">
          <ArcaShelterDetailPanel
            shelter={selectedShelter}
            showDetailedCapacity={canViewDetailedCapacity}
            showInternalNotes={canViewInternalNotes}
          />
          {isRouting && (
            <section className="border border-teal-300/20 bg-teal-500/8 p-3 text-xs text-teal-100">Calculando ruta con HERMES...</section>
          )}
          {routeResult && routeResult.shelterId === selectedId && (
            <section className="border border-teal-300/25 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
              <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-teal-300">Ruta sugerida (HERMES)</h2>
              <p className="mt-2 text-xs leading-5 text-slate-300">{routeResult.route.explanation}</p>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
