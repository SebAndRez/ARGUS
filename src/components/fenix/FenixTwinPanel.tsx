"use client";

import { useMemo, useState } from "react";
import { demoFenixScenarios } from "@/data/fenixDemo";
import { runFenixSimulation } from "@/lib/fenix/fenixSimulationEngine";
import FenixAccessBadge from "@/components/fenix/FenixAccessBadge";
import type { FenixInstitutionalAccessLevel, FenixVehicleType } from "@/types/fenix";

export default function FenixTwinPanel() {
  const [scenarioId, setScenarioId] = useState(demoFenixScenarios[0]?.id ?? "");
  const [accessLevel, setAccessLevel] =
    useState<FenixInstitutionalAccessLevel>("institutional");
  const [vehicleType, setVehicleType] = useState<FenixVehicleType>("car");
  const result = useMemo(
    () => runFenixSimulation({ scenarioId, accessLevel, vehicleType }),
    [accessLevel, scenarioId, vehicleType]
  );
  const scenario = demoFenixScenarios.find((item) => item.id === scenarioId);

  return (
    <section className="min-h-screen bg-slate-950 p-4 text-white xl:p-8">
      <header className="rounded-lg border border-cyan-300/15 bg-slate-950/85 p-5 shadow-2xl shadow-black/30">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-cyan-300">
              ARGUS Fenix Twin
            </p>
            <h1 className="mt-2 text-2xl font-semibold">
              Gemelo Digital de Evacuacion y Respuesta Critica
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Simula el desastre antes de que el desastre gane la partida. Demo
              operativo: no reemplaza instrucciones oficiales.
            </p>
          </div>
          <FenixAccessBadge accessLevel={accessLevel} />
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <select
            value={scenarioId}
            onChange={(event) => setScenarioId(event.target.value)}
            className="rounded border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
          >
            {demoFenixScenarios.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
          <select
            value={vehicleType}
            onChange={(event) => setVehicleType(event.target.value as FenixVehicleType)}
            className="rounded border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
          >
            {["pedestrian", "car", "bus", "ambulance", "firetruck", "four_by_four"].map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <select
            value={accessLevel}
            onChange={(event) => setAccessLevel(event.target.value as FenixInstitutionalAccessLevel)}
            className="rounded border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
          >
            <option value="public">Vista publica</option>
            <option value="institutional">Vista institucional</option>
          </select>
        </div>
      </header>

      <main className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="grid gap-5">
          <div className="rounded-lg border border-white/10 bg-slate-950/85 p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Escenario</p>
            <h2 className="mt-2 text-xl font-semibold">{scenario?.name}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">{scenario?.description}</p>
            <p className="mt-3 rounded border border-cyan-300/15 bg-cyan-400/8 p-3 text-sm text-cyan-100">
              {result.publicInstruction}
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <Metric label="Poblacion expuesta" value={result.totalExposedPopulation.toLocaleString("es-CL")} />
            <Metric label="Tiempo evacuacion" value={`${result.estimatedEvacuationTimeMinutes} min`} />
            <Metric label="Rutas criticas" value={String(result.criticalRoutes.length)} />
            <Metric label="Confianza" value={`${result.confidenceScore}%`} />
          </div>

          <div className="rounded-lg border border-white/10 bg-slate-950/85 p-5">
            <h3 className="text-sm font-semibold uppercase text-white">Prediccion de colapso vial</h3>
            <div className="mt-3 grid gap-2">
              {result.collapsePredictions.map((prediction) => (
                <div key={prediction.routeId} className="rounded border border-white/10 bg-slate-900/65 p-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="font-semibold text-white">{prediction.routeName}</span>
                    <span className="text-amber-200">{Math.round(prediction.collapseRisk * 100)}%</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{prediction.reason}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="grid content-start gap-5">
          <div className="rounded-lg border border-white/10 bg-slate-950/85 p-5">
            <h3 className="text-sm font-semibold uppercase text-white">Refugio recomendado</h3>
            <p className="mt-3 text-lg font-semibold text-cyan-100">
              {result.recommendedShelter?.name ?? "Sin refugio recomendado"}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Capacidad {result.recommendedShelter?.currentOccupancy ?? 0}/
              {result.recommendedShelter?.capacity ?? 0}
            </p>
          </div>

          <div className="rounded-lg border border-white/10 bg-slate-950/85 p-5">
            <h3 className="text-sm font-semibold uppercase text-white">Plan de accion</h3>
            <div className="mt-3 grid gap-2">
              {result.actionPlan.items.map((item) => (
                <div key={item.id} className="rounded border border-white/10 bg-slate-900/65 p-3">
                  <p className="text-xs font-bold uppercase text-amber-200">{item.priority}</p>
                  <p className="mt-1 text-sm font-semibold text-white">{item.title}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </main>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/85 p-4">
      <p className="text-[0.58rem] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}
