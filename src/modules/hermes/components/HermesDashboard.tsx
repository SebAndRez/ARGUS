"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/hooks/useSession";
import { useUserLocation } from "@/hooks/useUserLocation";
import type { CrisisEvent } from "@/types/crisis";
import type { HermesBlockage, HermesGeoPoint, HermesMobilityMode, HermesRoute, HermesRoutePurpose } from "@/modules/hermes/types";
import { hermesDemoBlockages } from "@/modules/hermes/data";
import { crisisEventToVigiaReport } from "@/modules/vigia/utils";
import { convertVigiaReportsToHermesBlockages } from "@/modules/hermes/hermesVigiaBridge";
import { convertTalosAssessmentsToHermesRiskZones } from "@/modules/hermes/hermesTalosBridge";
import { talosDemoAssessments } from "@/modules/talos/data";
import { calculateHermesRoutes } from "@/modules/hermes/hermesRouting";
import { getHermesAtlasSummary } from "@/modules/hermes/hermesAtlasBridge";
import {
  canUseHermesFeature,
  resolveHermesModuleAccess,
  resolveHermesRole,
} from "@/modules/hermes/hermesAccess";
import { auditHermesAction } from "@/modules/hermes/hermesAudit";
import { formatHermesRelativeTime } from "@/modules/hermes/utils";

import HermesHeader from "@/modules/hermes/components/HermesHeader";
import HermesKpiGrid from "@/modules/hermes/components/HermesKpiGrid";
import HermesRoutePlanner from "@/modules/hermes/components/HermesRoutePlanner";
import HermesRouteMapPanel from "@/modules/hermes/components/HermesRouteMapPanel";
import HermesRouteList from "@/modules/hermes/components/HermesRouteList";
import HermesBlockagePanel from "@/modules/hermes/components/HermesBlockagePanel";
import HermesEvacuationPanel from "@/modules/hermes/components/HermesEvacuationPanel";
import HermesOperationalLayersPanel from "@/modules/hermes/components/HermesOperationalLayersPanel";
import HermesRouteExplanationPanel from "@/modules/hermes/components/HermesRouteExplanationPanel";
import HermesIntegrationPanel from "@/modules/hermes/components/HermesIntegrationPanel";
import HermesAccessDenied from "@/modules/hermes/components/HermesAccessDenied";

export default function HermesDashboard() {
  const { user: sessionUser, loading: sessionLoading } = useSession();
  const location = useUserLocation();

  const [vigiaBlockages, setVigiaBlockages] = useState<HermesBlockage[]>([]);
  const [apiLoaded, setApiLoaded] = useState(false);
  const [routes, setRoutes] = useState<HermesRoute[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const hermesRole = resolveHermesRole(sessionUser);
  const moduleAccess = resolveHermesModuleAccess(hermesRole);
  const canViewRiskLayers = canUseHermesFeature(sessionUser, "view_risk_layers");
  const canViewOperationalLayers = canUseHermesFeature(sessionUser, "view_operational_layers");
  const canPlanBasicRoute = canUseHermesFeature(sessionUser, "plan_basic_route");
  const canSend = canUseHermesFeature(sessionUser, "send_to_atlas") || canUseHermesFeature(sessionUser, "send_to_fenix");

  useEffect(() => {
    if (!moduleAccess.canEnter || sessionLoading) return;
    auditHermesAction({ userRole: hermesRole, userId: sessionUser?.id, action: "module_view", reason: "hermes_dashboard_opened" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleAccess.canEnter, sessionLoading]);

  useEffect(() => {
    async function loadReports() {
      try {
        const res = await fetch("/api/events", { cache: "no-store" });
        const data = await res.json();
        const reportsOnly: CrisisEvent[] = (data.events ?? []).filter((event: CrisisEvent) => event.type === "REPORT");
        const blockages = convertVigiaReportsToHermesBlockages(reportsOnly.map(crisisEventToVigiaReport));
        setVigiaBlockages(blockages);
      } catch {
        setStatusMessage("No se pudieron cargar reportes de movilidad en este momento.");
      } finally {
        setApiLoaded(true);
      }
    }
    loadReports();
  }, []);

  const isDemoData = apiLoaded && vigiaBlockages.length === 0;
  const blockages = isDemoData ? hermesDemoBlockages : vigiaBlockages;

  // Zonas de riesgo TALOS: reutiliza el motor real de TALOS (mismo set demo
  // usado por `/modules/talos`) a través del puente `hermesTalosBridge.ts`,
  // sin recalcular riesgo por su cuenta.
  const riskZones = useMemo(
    () => (canViewRiskLayers ? convertTalosAssessmentsToHermesRiskZones(talosDemoAssessments) : []),
    [canViewRiskLayers]
  );

  const selectedRoute = routes.find((route) => route.id === selectedRouteId) ?? null;

  async function handleCalculate(input: { origin: HermesGeoPoint; destination: HermesGeoPoint; mode: HermesMobilityMode; purpose: HermesRoutePurpose }) {
    setIsCalculating(true);
    setStatusMessage(null);
    try {
      const result = await calculateHermesRoutes({
        origin: input.origin,
        destination: input.destination,
        mobilityMode: input.mode,
        purpose: input.purpose,
        blockages,
        riskZones,
      });
      setRoutes(result);
      setSelectedRouteId(result[0]?.id ?? null);

      const action =
        input.purpose === "evacuation"
          ? "EVACUATION_ROUTE_CALCULATED"
          : input.purpose === "medical_access"
            ? "MEDICAL_ROUTE_CALCULATED"
            : input.purpose === "logistics_delivery"
              ? "LOGISTICS_ROUTE_CALCULATED"
              : "ROUTE_CALCULATED";
      auditHermesAction({ userId: sessionUser?.id, userRole: hermesRole, action, routeId: result[0]?.id });
    } catch {
      setStatusMessage("No se pudo calcular la ruta en este momento.");
    } finally {
      setIsCalculating(false);
    }
  }

  function handleClear() {
    setRoutes([]);
    setSelectedRouteId(null);
    setStatusMessage(null);
  }

  function handleSelectRoute(route: HermesRoute) {
    setSelectedRouteId(route.id);
  }

  function handleSendToAtlas() {
    auditHermesAction({ userId: sessionUser?.id, userRole: hermesRole, action: "SEND_TO_ATLAS" });
    setStatusMessage("Resumen HERMES enviado a ATLAS (preparado, no implementado aún).");
  }

  const atlasSummary = useMemo(() => getHermesAtlasSummary(routes, blockages), [routes, blockages]);
  const evacuationRoutes = routes.filter((route) => route.purpose === "evacuation");

  if (sessionLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
        <div className="border border-teal-300/20 bg-slate-900/90 p-6 text-sm text-teal-100">Cargando ARGUS HERMES...</div>
      </main>
    );
  }

  if (!moduleAccess.canView || !moduleAccess.canEnter) {
    return <HermesAccessDenied userRole={hermesRole} reason={moduleAccess.reason} />;
  }

  const kpis = [
    { label: "Rutas evaluadas", value: routes.length },
    { label: "Disponibles", value: routes.filter((r) => r.status === "available").length },
    { label: "Con precaución", value: routes.filter((r) => r.status === "caution").length },
    { label: "Bloqueadas", value: routes.filter((r) => r.status === "blocked").length },
    { label: "Bloqueos activos", value: blockages.filter((b) => b.status !== "cleared").length },
    { label: "Reportes de movilidad", value: blockages.length },
    { label: "Rutas a refugios", value: routes.filter((r) => r.purpose === "shelter_access").length },
    { label: "Rutas médicas", value: routes.filter((r) => r.purpose === "medical_access").length },
    { label: "Última actualización", value: formatHermesRelativeTime(atlasSummary.lastUpdatedIso) },
  ];

  const layers = [
    { label: "Rutas sugeridas", active: routes.length > 0 },
    { label: "Bloqueos", active: blockages.length > 0 },
    { label: "Zonas de riesgo TALOS", active: canViewRiskLayers && riskZones.length > 0 },
    { label: "Reportes VIGÍA", active: !isDemoData },
    { label: "Refugios ARCA", active: false, future: true },
    { label: "Puntos médicos AURA", active: false, future: true },
    { label: "Puntos logísticos NEXUS", active: false, future: true },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <HermesHeader isDemoData={isDemoData} blockedCount={routes.filter((r) => r.status === "blocked").length} userRole={hermesRole} />
      <HermesKpiGrid kpis={kpis} />

      {statusMessage && (
        <div className="mx-4 mb-3 border border-teal-400/20 bg-teal-500/10 px-4 py-3 text-sm text-teal-100 sm:mx-6">
          {statusMessage}
        </div>
      )}

      <main className="grid gap-4 px-4 pb-8 sm:px-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-4 min-w-0">
          {canPlanBasicRoute ? (
            <HermesRoutePlanner
              currentLocation={{ latitude: location.latitude, longitude: location.longitude }}
              onCalculate={handleCalculate}
              onClear={handleClear}
              isCalculating={isCalculating}
            />
          ) : (
            <section className="border border-amber-300/25 bg-amber-400/8 p-3 text-sm text-amber-100">
              Inicia sesión con una cuenta verificada para planificar rutas. Puedes seguir viendo rutas públicas y bloqueos.
            </section>
          )}

          <HermesRouteMapPanel selectedRoute={selectedRoute} blockages={blockages} riskZones={riskZones} />
          <HermesRouteList routes={routes} onSelect={handleSelectRoute} />

          {canViewOperationalLayers && <HermesOperationalLayersPanel layers={layers} />}

          <HermesEvacuationPanel evacuationRoutes={evacuationRoutes} />
          <HermesIntegrationPanel />

          {canSend && (
            <section className="border border-white/10 bg-slate-950/85 p-3 shadow-xl shadow-black/25">
              <button
                type="button"
                onClick={handleSendToAtlas}
                className="border border-cyan-300/30 bg-cyan-400/10 px-3 py-1.5 text-[0.62rem] font-bold uppercase text-cyan-100"
              >
                Enviar resumen a ATLAS
              </button>
            </section>
          )}
        </div>

        <div className="grid min-w-0 auto-rows-max gap-4">
          <HermesBlockagePanel blockages={blockages} />
          <HermesRouteExplanationPanel route={selectedRoute} />
        </div>
      </main>
    </div>
  );
}
