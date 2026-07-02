"use client";

import { useState } from "react";
import { demoFenixScenarios } from "@/data/fenixDemo";
import FenixAccessBadge from "@/components/fenix/FenixAccessBadge";
import { useI18n } from "@/hooks/useI18n";
import type {
  FenixGrowthDirection,
  FenixSimulationInput,
  FenixSimulationResult,
} from "@/types/fenixSimulation";
import type {
  FenixHazardType,
  FenixInstitutionalAccessLevel,
  FenixVehicleType,
} from "@/types/fenix";

const crisisTypes: Array<{ value: FenixSimulationInput["crisisType"]; label: string }> = [
  { value: "earthquake", label: "Terremoto" },
  { value: "tsunami", label: "Tsunami" },
  { value: "wildfire", label: "Incendio" },
  { value: "flood", label: "Inundación" },
  { value: "volcanic", label: "Erupción" },
  { value: "chemical", label: "Accidente químico" },
  { value: "conflict", label: "Conflicto/crisis" },
  { value: "mass_casualty", label: "Accidente masivo" },
];

const vehicleTypes: Array<{ value: FenixVehicleType | "mixed" | "light_vehicle" | "logistics_truck"; label: string }> = [
  { value: "pedestrian", label: "Peatón" },
  { value: "light_vehicle", label: "Vehículo liviano" },
  { value: "bus", label: "Bus" },
  { value: "ambulance", label: "Ambulancia" },
  { value: "logistics_truck", label: "Camión/logística" },
  { value: "mixed", label: "Mixto" },
];

const timeOptions: Array<{ value: FenixSimulationInput["simulationMinutes"]; label: string }> = [
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 60, label: "1 h" },
  { value: 180, label: "3 h" },
  { value: 360, label: "6 h" },
  { value: 720, label: "12 h" },
  { value: 1440, label: "24 h" },
];

const directions: FenixGrowthDirection[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

function inputClass() {
  return "min-h-10 rounded border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/60";
}

export default function FenixTwinPanel() {
  const { t, formatNumber } = useI18n("CL");
  const [scenarioId, setScenarioId] = useState(demoFenixScenarios[0]?.id ?? "");
  const currentScenario = demoFenixScenarios.find((item) => item.id === scenarioId) ?? demoFenixScenarios[0];
  const [accessLevel, setAccessLevel] =
    useState<FenixInstitutionalAccessLevel>("institutional");
  const [crisisType, setCrisisType] =
    useState<FenixSimulationInput["crisisType"]>(currentScenario?.hazardType ?? "wildfire");
  const [latitude, setLatitude] = useState(String(currentScenario?.center[0] ?? -33.45));
  const [longitude, setLongitude] = useState(String(currentScenario?.center[1] ?? -70.66));
  const [radiusKm, setRadiusKm] = useState(String(currentScenario?.radiusKm ?? 5));
  const [direction, setDirection] = useState<FenixGrowthDirection>("NE");
  const [speedKmh, setSpeedKmh] = useState("2.5");
  const [simulationMinutes, setSimulationMinutes] =
    useState<FenixSimulationInput["simulationMinutes"]>(60);
  const [mobility, setMobility] = useState<FenixSimulationInput["mobility"]>("mixed");
  const [initialSeverity, setInitialSeverity] =
    useState<FenixSimulationInput["initialSeverity"]>("high");
  const [uncertainty, setUncertainty] =
    useState<FenixSimulationInput["uncertainty"]>("medium");
  const [population, setPopulation] = useState("");
  const [result, setResult] = useState<FenixSimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generateSimulation() {
    setLoading(true);
    setError(null);
    const payload: FenixSimulationInput = {
      scenarioId,
      crisisType,
      initialLocation: {
        latitude: Number(latitude),
        longitude: Number(longitude),
        commune: currentScenario?.regionName,
        region: currentScenario?.regionName,
      },
      initialRadiusKm: Number(radiusKm),
      growth: { direction, speedKmh: Number(speedKmh) },
      simulationMinutes,
      exposedPopulationEstimate: population ? Number(population) : undefined,
      mobility,
      mode: accessLevel,
      initialSeverity,
      uncertainty,
      sources: {
        citizenReports: true,
        connectedUsersAggregate: true,
        officialOrOpenRoutes: true,
        shelters: true,
        medicalPoints: true,
        existingIncidents: true,
        weather: true,
      },
    };

    try {
      const response = await fetch("/api/fenix/simulation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo generar la simulación.");
      setResult(data.result ?? data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Error desconocido.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="min-h-screen bg-slate-950 p-4 text-white xl:p-8">
      <header className="rounded-lg border border-cyan-300/15 bg-slate-950/85 p-5 shadow-2xl shadow-black/30">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-cyan-300">
              {t("fenix.title")}
            </p>
            <h1 className="mt-2 text-2xl font-semibold">{t("fenix.subtitle")}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Demo operativo: genera un curso de crisis estimado, no una instrucción oficial.
            </p>
          </div>
          <FenixAccessBadge accessLevel={accessLevel} />
        </div>
      </header>

      <main className="mt-5 grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <section className="rounded-lg border border-white/10 bg-slate-950/85 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-200">
            {t("fenix.parameters")}
          </h2>
          <div className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm text-slate-300">
              Escenario base
              <select value={scenarioId} onChange={(event) => setScenarioId(event.target.value)} className={inputClass()}>
                {demoFenixScenarios.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm text-slate-300">
              Tipo de crisis
              <select value={crisisType} onChange={(event) => setCrisisType(event.target.value as FenixHazardType)} className={inputClass()}>
                {crisisTypes.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-sm text-slate-300">
                Latitud
                <input value={latitude} onChange={(event) => setLatitude(event.target.value)} className={inputClass()} />
              </label>
              <label className="grid gap-1 text-sm text-slate-300">
                Longitud
                <input value={longitude} onChange={(event) => setLongitude(event.target.value)} className={inputClass()} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-sm text-slate-300">
                Radio inicial km
                <input value={radiusKm} onChange={(event) => setRadiusKm(event.target.value)} className={inputClass()} />
              </label>
              <label className="grid gap-1 text-sm text-slate-300">
                Población expuesta
                <input value={population} onChange={(event) => setPopulation(event.target.value)} className={inputClass()} placeholder="opcional" />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-sm text-slate-300">
                Dirección
                <select value={direction} onChange={(event) => setDirection(event.target.value as FenixGrowthDirection)} className={inputClass()}>
                  {directions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm text-slate-300">
                Velocidad km/h
                <input value={speedKmh} onChange={(event) => setSpeedKmh(event.target.value)} className={inputClass()} />
              </label>
            </div>
            <label className="grid gap-1 text-sm text-slate-300">
              Tiempo de simulación
              <select value={simulationMinutes} onChange={(event) => setSimulationMinutes(Number(event.target.value) as FenixSimulationInput["simulationMinutes"])} className={inputClass()}>
                {timeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm text-slate-300">
              Movilidad
              <select value={mobility} onChange={(event) => setMobility(event.target.value as FenixSimulationInput["mobility"])} className={inputClass()}>
                {vehicleTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <label className="grid gap-1 text-sm text-slate-300">
                Modo
                <select value={accessLevel} onChange={(event) => setAccessLevel(event.target.value as FenixInstitutionalAccessLevel)} className={inputClass()}>
                  <option value="public">{t("fenix.publicMode")}</option>
                  <option value="institutional">{t("fenix.institutionalMode")}</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm text-slate-300">
                Severidad
                <select value={initialSeverity} onChange={(event) => setInitialSeverity(event.target.value as FenixSimulationInput["initialSeverity"])} className={inputClass()}>
                  <option value="low">baja</option>
                  <option value="medium">media</option>
                  <option value="high">alta</option>
                  <option value="critical">crítica</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm text-slate-300">
                Incertidumbre
                <select value={uncertainty} onChange={(event) => setUncertainty(event.target.value as FenixSimulationInput["uncertainty"])} className={inputClass()}>
                  <option value="low">baja</option>
                  <option value="medium">media</option>
                  <option value="high">alta</option>
                </select>
              </label>
            </div>
            {error && <p className="rounded border border-red-300/20 bg-red-400/10 p-3 text-sm text-red-100">{error}</p>}
            <button
              type="button"
              onClick={generateSimulation}
              disabled={loading}
              className="mt-2 min-h-12 rounded bg-cyan-400 px-4 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? t("fenix.generating") : t("fenix.generate")}
            </button>
          </div>
        </section>

        <section className="grid content-start gap-5">
          {!result ? (
            <div className="rounded-lg border border-white/10 bg-slate-950/85 p-5 text-sm leading-6 text-slate-400">
              Declare una crisis, ajuste crecimiento/datos esperados y pulse
              <span className="font-semibold text-cyan-100"> Generar simulación</span>.
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-cyan-300/15 bg-slate-950/85 p-5">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{t("fenix.results")}</p>
                <h2 className="mt-2 text-xl font-semibold">{result.course.initialCrisis}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">{result.course.expectedGrowth}</p>
                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <Metric label="Población" value={formatNumber(result.course.populationExposure.estimatedPeople)} />
                  <Metric label="Usuarios agregados" value={formatNumber(result.connectedUsersAggregate.approximateCount)} />
                  <Metric label="Reportes" value={String(result.reportDensity.relatedReports)} />
                  <Metric label="Confianza" value={`${result.confidence}%`} />
                </div>
              </div>

              <div className="grid gap-5 xl:grid-cols-2">
                <Panel title="Timeline">
                  {result.affectedZones.map((zone) => (
                    <Row key={zone.id} title={zone.timeLabel} detail={`Radio ${zone.radiusKm} km · ${zone.exposureLevel} · zona estimada`} />
                  ))}
                </Panel>
                <Panel title="Rutas afectadas">
                  {result.routeImpacts.map((route) => (
                    <Row key={route.routeId} title={route.routeName} detail={`${route.status} · ${route.metadata.disclaimer}`} />
                  ))}
                </Panel>
                <Panel title="Refugios y puntos médicos">
                  {result.shelters.map((shelter) => (
                    <Row key={shelter.id} title={shelter.name} detail={`Presión ${shelter.pressure}`} />
                  ))}
                  {result.medicalPoints.map((point) => (
                    <Row key={point.id} title={point.name} detail={`${point.distanceKm} km · demo`} />
                  ))}
                </Panel>
                <Panel title="Acciones recomendadas">
                  {[...result.publicGuidance, ...result.institutionalActionPlan.map((item) => item.text)].map((item) => (
                    <Row key={item} title="Acción" detail={item} />
                  ))}
                </Panel>
              </div>

              <div className="rounded-lg border border-amber-300/20 bg-amber-400/10 p-5 text-sm leading-6 text-amber-100">
                <h3 className="font-semibold text-white">{t("fenix.limitations")}</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {result.disclaimers.map((item) => <li key={item}>{item}</li>)}
                </ul>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" className="rounded border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-bold uppercase text-white">
                    {t("fenix.actionPlan")}
                  </button>
                  <button type="button" className="rounded border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-bold uppercase text-white">
                    {t("fenix.exportSummary")}
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </main>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-900/65 p-3">
      <p className="text-[0.58rem] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/85 p-5">
      <h3 className="text-sm font-semibold uppercase text-white">{title}</h3>
      <div className="mt-3 grid gap-2">{children}</div>
    </div>
  );
}

function Row({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded border border-white/10 bg-slate-900/65 p-3 text-sm">
      <p className="font-semibold text-white">{title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-400">{detail}</p>
    </div>
  );
}
