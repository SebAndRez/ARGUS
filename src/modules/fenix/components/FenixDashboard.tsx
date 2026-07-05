"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/hooks/useSession";
import { fenixDemoScenarios } from "@/modules/fenix/data";
import { canUseFenixFeature, resolveFenixModuleAccess, resolveFenixRole } from "@/modules/fenix/fenixAccess";
import { auditFenixAction } from "@/modules/fenix/fenixAudit";
import { getFenixAtlasSummary } from "@/modules/fenix/fenixAtlasBridge";
import { calculateFenixScenarioConfidence } from "@/modules/fenix/fenixConfidence";
import { runFenixScenario } from "@/modules/fenix/fenixScenarioEngine";

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-amber-300/18 bg-slate-950/80 p-4 shadow-xl shadow-black/20">
      <h2 className="text-[0.7rem] font-bold uppercase tracking-[0.18em] text-amber-200">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default function FenixDashboard() {
  const { user, loading } = useSession();
  const role = resolveFenixRole(user);
  const access = resolveFenixModuleAccess(role);
  const [selectedId, setSelectedId] = useState(fenixDemoScenarios[0]?.id ?? "");
  const scenarios = useMemo(() => fenixDemoScenarios.map(runFenixScenario), []);
  const selected = scenarios.find((scenario) => scenario.id === selectedId) ?? scenarios[0];
  const atlasSummary = useMemo(() => getFenixAtlasSummary(scenarios), [scenarios]);

  useEffect(() => {
    if (!loading && access.canEnter) auditFenixAction({ userId: user?.id, userRole: role, action: "module_view", reason: "fenix_dashboard_opened" });
  }, [access.canEnter, loading, role, user?.id]);

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">Cargando ARGUS FENIX...</main>;

  if (!access.canEnter) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
        <section className="max-w-xl border border-amber-300/25 bg-slate-900 p-6">
          <h1 className="text-xl font-bold">ARGUS FENIX</h1>
          <p className="mt-2 text-sm text-slate-300">{access.reason}</p>
          <a href="/modules" className="mt-4 inline-flex border border-white/10 px-3 py-2 text-sm text-slate-200">Volver a modulos</a>
        </section>
      </main>
    );
  }

  const confidence = selected ? calculateFenixScenarioConfidence(selected) : null;
  const kpis = [
    ["Escenarios activos", atlasSummary.activeScenarios],
    ["Escenarios criticos", atlasSummary.criticalScenarios],
    ["Rutas en riesgo", atlasSummary.routesAtRisk],
    ["Refugios bajo presion", atlasSummary.sheltersUnderPressure],
    ["Brechas logisticas", atlasSummary.logisticsGaps],
    ["Presion medica", atlasSummary.medicalPressure],
    ["Confianza promedio", atlasSummary.confidenceAverage],
    ["Ultima actualizacion", atlasSummary.lastUpdated ? new Date(atlasSummary.lastUpdated).toLocaleString("es-CL") : "Sin datos"],
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-white/10 bg-slate-950/95 px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.28em] text-amber-300">Gemelo predictivo y simulacion de crisis</p>
            <h1 className="mt-1 text-2xl font-bold uppercase tracking-[0.06em]">ARGUS FENIX</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">Escenarios estimados, no ordenes oficiales. Todo resultado requiere validacion operacional.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="border border-amber-300/25 bg-amber-400/10 px-3 py-1.5 text-xs font-bold uppercase text-amber-100">Institucional / Predictivo</span>
            <span className="border border-cyan-300/25 bg-cyan-400/10 px-3 py-1.5 text-xs text-cyan-100">Rol: {role}</span>
            <span className="border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-300">Modo demo / simulaciones de prueba</span>
            <a href="/modules" className="border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-300">Volver a modulos</a>
          </div>
        </div>
      </header>

      <main className="grid gap-4 px-4 py-5 sm:px-6">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map(([label, value]) => (
            <div key={label} className="border border-white/10 bg-white/[0.035] p-3">
              <p className="text-[0.65rem] uppercase tracking-[0.16em] text-slate-500">{label}</p>
              <p className="mt-1 text-xl font-bold">{value}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="grid auto-rows-max gap-4">
            <Panel title="Constructor de escenario">
              <div className="grid gap-2 text-sm">
                <label className="grid gap-1 text-slate-300">Tipo de crisis<select className="border border-white/10 bg-slate-900 p-2 text-white"><option>Incendio forestal</option><option>Terremoto</option><option>Inundacion</option></select></label>
                <label className="grid gap-1 text-slate-300">Radio de impacto<input className="border border-white/10 bg-slate-900 p-2 text-white" value="4200 m" readOnly /></label>
                <label className="grid gap-1 text-slate-300">Ventana evacuacion<input className="border border-white/10 bg-slate-900 p-2 text-white" value="45 min" readOnly /></label>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
                  {["TALOS", "HERMES", "ARCA", "NEXUS", "AURA", "ORACULO", "VIGIA"].map((item) => <span key={item} className="border border-white/10 bg-white/[0.03] px-2 py-2">{item}</span>)}
                </div>
              </div>
            </Panel>

            <Panel title="Escenarios demo">
              <div className="grid gap-2">
                {scenarios.map((scenario) => (
                  <button key={scenario.id} onClick={() => setSelectedId(scenario.id)} className={`border p-3 text-left ${selected?.id === scenario.id ? "border-amber-300/40 bg-amber-400/10" : "border-white/10 bg-white/[0.03]"}`}>
                    <span className="text-sm font-semibold">{scenario.name}</span>
                    <span className="mt-1 block text-xs text-slate-400">{scenario.status} · confianza {scenario.confidence}</span>
                  </button>
                ))}
              </div>
            </Panel>
          </div>

          {selected && (
            <div className="grid gap-4">
              <Panel title="Simulacion seleccionada">
                <div className="grid gap-4 lg:grid-cols-3">
                  <div className="lg:col-span-2">
                    <h3 className="text-lg font-semibold">{selected.name}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{selected.description}</p>
                    <p className="mt-3 border border-amber-300/15 bg-amber-400/8 p-3 text-sm text-amber-100">
                      Escenario estimado basado en datos disponibles, riesgo TALOS, rutas HERMES, refugios ARCA y evidencia ORACULO. Requiere validacion operacional.
                    </p>
                  </div>
                  <dl className="grid gap-2 text-sm">
                    <div className="flex justify-between gap-3"><dt className="text-slate-400">Poblacion expuesta</dt><dd>{selected.outputs?.estimatedExposedPopulation ?? "Sin dato"}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-slate-400">Evacuacion</dt><dd>{selected.outputs?.estimatedEvacuationDemand ?? "Sin dato"}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-slate-400">Area km2</dt><dd>{selected.outputs?.estimatedAffectedAreaKm2 ?? "Sin dato"}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-slate-400">Confianza</dt><dd>{selected.confidence}</dd></div>
                  </dl>
                </div>
              </Panel>

              <div className="grid gap-4 lg:grid-cols-2">
                <Panel title="Impacto rutas">
                  <div className="grid gap-2">
                    {selected.outputs?.routeImpacts.map((impact) => <div key={impact.routeName} className="border border-white/10 bg-white/[0.03] p-2 text-sm"><strong>{impact.routeName}</strong><p className="text-xs text-slate-400">{impact.reason}</p></div>)}
                  </div>
                </Panel>
                <Panel title="Demanda refugios ARCA">
                  <div className="grid gap-2">
                    {selected.outputs?.shelterImpacts.map((impact) => <div key={impact.shelterName} className="border border-white/10 bg-white/[0.03] p-2 text-sm"><strong>{impact.shelterName}</strong><p className="text-xs text-slate-400">{impact.reason}</p></div>)}
                  </div>
                </Panel>
                <Panel title="Demanda logistica NEXUS">
                  <div className="grid gap-2">
                    {selected.outputs?.resourceImpacts.map((impact) => <div key={impact.category} className="border border-white/10 bg-white/[0.03] p-2 text-sm"><strong>{impact.category}</strong><p className="text-xs text-slate-400">{impact.reason}</p></div>)}
                  </div>
                </Panel>
                <Panel title="Impacto medico AURA">
                  <div className="grid gap-2">
                    {selected.outputs?.medicalImpacts.map((impact) => <div key={impact.medicalPointName} className="border border-white/10 bg-white/[0.03] p-2 text-sm"><strong>{impact.medicalPointName}</strong><p className="text-xs text-slate-400">{impact.reason}</p></div>)}
                  </div>
                </Panel>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Panel title="Confianza y datos faltantes">
                  <div className="grid gap-3 text-sm">
                    <div><p className="font-semibold text-emerald-200">Factores positivos</p><ul className="mt-1 grid gap-1 text-slate-300">{confidence?.positive.map((item) => <li key={item}>{item}</li>)}</ul></div>
                    <div><p className="font-semibold text-amber-200">Limitaciones</p><ul className="mt-1 grid gap-1 text-slate-300">{confidence?.negative.map((item) => <li key={item}>{item}</li>)}</ul></div>
                  </div>
                </Panel>
                <Panel title="Plan de accion sugerido">
                  <div className="grid gap-2">
                    {selected.outputs?.actionPlan.map((item) => <div key={item.id} className="border border-white/10 bg-white/[0.03] p-2 text-sm"><strong>{item.module} · {item.priority}</strong><p className="text-xs text-slate-400">{item.action} {item.reason}</p></div>)}
                  </div>
                </Panel>
              </div>
            </div>
          )}
        </section>

        {canUseFenixFeature(role, "run_scenario") && <span className="sr-only">FENIX run_scenario habilitado</span>}
      </main>
    </div>
  );
}
