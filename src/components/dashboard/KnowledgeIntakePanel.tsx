"use client";

import { useMemo, useState } from "react";
import IncidentKnowledgeCard from "@/components/dashboard/IncidentKnowledgeCard";
import KnowledgeDomainFilter, { domainFilterMap, type KnowledgeDomainFilterValue } from "@/components/dashboard/KnowledgeDomainFilter";
import KnowledgeInputUploadPanel from "@/components/dashboard/KnowledgeInputUploadPanel";
import KnowledgeSourceRegistryPanel from "@/components/dashboard/KnowledgeSourceRegistryPanel";
import LessonsLearnedPanel from "@/components/dashboard/LessonsLearnedPanel";
import SimilarIncidentsPanel from "@/components/dashboard/SimilarIncidentsPanel";
import { demoKnowledgeIncidents } from "@/data/knowledgeIntakeDemo";
import { getAllKnowledgeSources, getKnowledgeSourceStats } from "@/lib/knowledge-intake/sourceRegistry";
import type { ArgusIncidentKnowledge } from "@/types/knowledgeIntake";

const domainStats = (() => {
  const counts = new Map<string, number>();
  demoKnowledgeIncidents.forEach((incident) => counts.set(incident.domain, (counts.get(incident.domain) ?? 0) + 1));
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
})();

export default function KnowledgeIntakePanel() {
  const sources = useMemo(() => getAllKnowledgeSources(), []);
  const stats = useMemo(() => getKnowledgeSourceStats(), []);
  const [filter, setFilter] = useState<KnowledgeDomainFilterValue>("all");
  const [previewIncident, setPreviewIncident] = useState<ArgusIncidentKnowledge | null>(null);
  const [liveStatus, setLiveStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [liveMessage, setLiveMessage] = useState("Sin prueba en vivo ejecutada.");
  const [liveIncidents, setLiveIncidents] = useState<ArgusIncidentKnowledge[]>([]);
  const [nwsQuery, setNwsQuery] = useState("area=US");
  const [openMeteoLat, setOpenMeteoLat] = useState("-33.4489");
  const [openMeteoLon, setOpenMeteoLon] = useState("-70.6693");
  const [openMeteoPurpose, setOpenMeteoPurpose] = useState("general");
  const [usgsWaterSite, setUsgsWaterSite] = useState("01646500");
  const [usgsWaterLat, setUsgsWaterLat] = useState("38.9498");
  const [usgsWaterLon, setUsgsWaterLon] = useState("-77.1277");
  const [usgsWaterRadiusKm, setUsgsWaterRadiusKm] = useState("25");
  const [usgsWaterPurpose, setUsgsWaterPurpose] = useState("flood");
  const [usgsWaterParameters, setUsgsWaterParameters] = useState("00060,00065");
  const [noaaYear, setNoaaYear] = useState("2025");
  const [noaaState, setNoaaState] = useState("TX");
  const [noaaEventTypes, setNoaaEventTypes] = useState("Tornado,Flash Flood");
  const [noaaLimit, setNoaaLimit] = useState("100");
  const [openFemaYear, setOpenFemaYear] = useState("2025");
  const [openFemaState, setOpenFemaState] = useState("CA");
  const [openFemaIncidentTypes, setOpenFemaIncidentTypes] = useState("Fire,Flood");
  const [openFemaDisasterNumber, setOpenFemaDisasterNumber] = useState("");
  const [openFemaLimit, setOpenFemaLimit] = useState("100");
  const [jobStatus, setJobStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [jobMessage, setJobMessage] = useState("Sin job persistente ejecutado.");
  const [healthSummary, setHealthSummary] = useState<{
    persistedIncidents?: number;
    persistedDocuments?: number;
    persistedLessons?: number;
    pendingReviews?: number;
    latestIngestionRuns?: Array<{ id: string; sourceId: string; status: string; recordsInserted?: number; recordsUpdated?: number; recordsSkipped?: number }>;
    incidentsByDomain?: Array<{ domain: string; count: number }>;
  } | null>(null);

  const filteredIncidents = useMemo(() => {
    const domains = domainFilterMap[filter];
    return demoKnowledgeIncidents.filter((incident) => {
      if (filter === "chile") return incident.country === "CL";
      if (filter === "global") return true;
      return domains.length === 0 || domains.includes(incident.domain);
    });
  }, [filter]);
  const selectedIncident = previewIncident ?? filteredIncidents[0] ?? demoKnowledgeIncidents[0];
  const realActiveSources = sources.filter((source) => source.status === "active" || source.status === "active_historical" || source.status === "active_institutional");
  const stubSources = sources.filter((source) => source.status === "planned" || source.status === "stub");
  const requiresKeySources = sources.filter((source) => source.status === "requiresApiKey");
  const requiresConfigSources = sources.filter((source) => source.status === "requiresConfiguration");
  async function runLiveTest(source: "usgs" | "gdacs" | "eonet" | "hans" | "nws" | "open-meteo" | "usgs-water" | "noaa" | "openfema" | "reliefweb") {
    setLiveStatus("loading");
    setLiveMessage(`Probando ${source.toUpperCase()}...`);
    try {
      const endpoint =
        source === "usgs"
          ? "/api/knowledge-intake/live/usgs?feed=relevant&limit=8"
          : source === "gdacs"
            ? "/api/knowledge-intake/live/gdacs?eventTypes=EQ;TC;FL;VO;DR;WF&daysBack=7&alertLevels=red;orange;green&limit=8"
            : source === "eonet"
              ? "/api/knowledge-intake/live/eonet?status=open&days=30&limit=8"
              : source === "hans"
                ? "/api/knowledge-intake/live/usgs-volcano-hans?mode=elevated&observatory=all&days=7&includeNotices=true&includeGeoJson=true&limit=8"
                : source === "nws"
                  ? `/api/knowledge-intake/live/nws?mode=alerts&${nwsQuery}&limit=8`
                  : source === "open-meteo"
                    ? `/api/knowledge-intake/live/open-meteo?lat=${encodeURIComponent(openMeteoLat)}&lon=${encodeURIComponent(openMeteoLon)}&forecastDays=3&purpose=${encodeURIComponent(openMeteoPurpose)}`
                    : source === "usgs-water"
                      ? `/api/knowledge-intake/live/usgs-water?${usgsWaterSite ? `site=${encodeURIComponent(usgsWaterSite)}` : `lat=${encodeURIComponent(usgsWaterLat)}&lon=${encodeURIComponent(usgsWaterLon)}`}&radiusKm=${encodeURIComponent(usgsWaterRadiusKm)}&purpose=${encodeURIComponent(usgsWaterPurpose)}&parameters=${encodeURIComponent(usgsWaterParameters)}`
                    : source === "noaa"
                      ? `/api/knowledge-intake/live/noaa-storm-events?mode=preview&year=${encodeURIComponent(noaaYear)}&state=${encodeURIComponent(noaaState)}&eventTypes=${encodeURIComponent(noaaEventTypes)}&limit=${encodeURIComponent(noaaLimit)}`
                    : source === "openfema"
                      ? `/api/knowledge-intake/live/openfema?dataset=disaster-declarations&year=${encodeURIComponent(openFemaYear)}&state=${encodeURIComponent(openFemaState)}&incidentTypes=${encodeURIComponent(openFemaIncidentTypes)}&disasterNumber=${encodeURIComponent(openFemaDisasterNumber)}&limit=${encodeURIComponent(openFemaLimit)}`
                    : "/api/knowledge-intake/live/reliefweb?limit=6";
      const response = await fetch(endpoint, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? data.error ?? `Fallo ${source}`);
      setLiveIncidents(data.incidents ?? []);
      setLiveStatus("ready");
      if (source === "open-meteo") {
        const flags = Object.entries(data.riskFactors ?? {}).filter(([, active]) => active).map(([key]) => key);
        setLiveMessage(`Open-Meteo entrego contexto ${data.weatherContext?.forecastDays ?? 3}d sin crear incidentes. Riesgos: ${flags.length ? flags.join(", ") : "sin factores elevados"}.`);
      } else if (source === "usgs-water") {
        const context = data.hydrologicalContext;
        setLiveMessage(`USGS Water: ${context?.locations?.length ?? 0} estacion(es), ${context?.measurements?.length ?? 0} medicion(es), staleness ${context?.stalenessMinutes ?? "n/a"} min, evidenceCreated ${data.evidenceCreated ? "si" : "no"}.`);
      } else if (source === "noaa") {
        setLiveMessage(`NOAA Storm Events preview: ${data.normalized ?? 0} evento(s) historico(s), persistidos ${data.persisted ?? 0}. No es fuente live.`);
      } else if (source === "openfema") {
        setLiveMessage(`OpenFEMA preview: ${data.normalized ?? 0} declaracion(es), evidencia ${data.evidence?.length ?? 0}, precedentes ${data.operationalPrecedents?.length ?? 0}. No es sensor live.`);
      } else {
        setLiveMessage(`${data.sourceName ?? data.source ?? source} entrego ${data.count ?? data.normalized ?? 0} incidente(s) normalizado(s).`);
      }
    } catch (error) {
      setLiveStatus("error");
      setLiveMessage(error instanceof Error ? error.message : "No se pudo ejecutar prueba en vivo.");
    }
  }

  async function runPersistentJob(source: "usgs" | "gdacs" | "eonet" | "hans" | "nws" | "open-meteo" | "usgs-water" | "noaa" | "openfema") {
    setJobStatus("loading");
    setJobMessage(`Ejecutando ${source.toUpperCase()} persistente...`);
    try {
      const endpoint =
        source === "usgs"
          ? "/api/knowledge-intake/jobs/run-usgs"
          : source === "gdacs"
            ? "/api/knowledge-intake/jobs/run-gdacs"
            : source === "eonet"
              ? "/api/knowledge-intake/jobs/run-eonet"
              : source === "hans"
                ? "/api/knowledge-intake/jobs/run-usgs-volcano-hans"
                : source === "nws"
                  ? "/api/knowledge-intake/jobs/run-nws"
                  : source === "noaa"
                    ? "/api/knowledge-intake/jobs/import-noaa-storm-events"
                  : source === "usgs-water"
                    ? "/api/knowledge-intake/jobs/run-usgs-water-context"
                  : source === "openfema"
                    ? "/api/knowledge-intake/jobs/import-openfema-disaster-declarations"
                    : "/api/knowledge-intake/jobs/run-open-meteo-context";
      const body = source === "usgs"
        ? { feedType: "relevant", limit: 25 }
        : source === "gdacs"
          ? { eventTypes: ["EQ", "TC", "FL", "VO", "DR", "WF"], daysBack: 7, alertLevels: ["red", "orange", "green"], persist: true, limit: 50 }
          : source === "eonet"
            ? {
              status: "open",
              days: 30,
              categories: ["wildfires", "severeStorms", "volcanoes", "floods", "landslides", "drought", "dustHaze"],
              persist: true,
              limit: 50,
            }
            : {
              mode: "elevated",
              observatory: "all",
              days: 7,
              includeNotices: true,
              includeGeoJson: true,
              persist: true,
              limit: 50,
            };
      const finalBody = source === "nws"
        ? {
          mode: "alerts",
          ...(nwsQuery.startsWith("point=") ? { point: nwsQuery.replace(/^point=/, "") } : {}),
          ...(nwsQuery.startsWith("area=") ? { area: nwsQuery.replace(/^area=/, "") } : {}),
          persist: true,
          limit: 50,
        }
        : source === "open-meteo"
          ? {
            purpose: "incident_context",
            forecastDays: 3,
            maxIncidents: 25,
            sinceHours: 24,
            persist: true,
          }
        : source === "usgs-water"
          ? {
            purpose: usgsWaterPurpose,
            radiusKm: Number(usgsWaterRadiusKm) || 25,
            parameters: usgsWaterParameters.split(/[;,]/).map((item) => item.trim()).filter(Boolean),
            maxIncidents: 25,
            sinceHours: 24,
            persist: true,
          }
        : source === "noaa"
          ? {
            year: Number(noaaYear),
            state: noaaState || undefined,
            eventTypes: noaaEventTypes.split(/[;,]/).map((item) => item.trim()).filter(Boolean),
            limit: Number(noaaLimit) || 1000,
            persist: true,
          }
        : source === "openfema"
          ? {
            year: Number(openFemaYear) || undefined,
            state: openFemaState || undefined,
            incidentTypes: openFemaIncidentTypes.split(/[;,]/).map((item) => item.trim()).filter(Boolean),
            disasterNumber: openFemaDisasterNumber || undefined,
            limit: Number(openFemaLimit) || 1000,
            persist: true,
          }
        : body;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalBody),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? `${source.toUpperCase()} persistent job failed`);
      setJobStatus("ready");
      setJobMessage(
        source === "open-meteo"
          ? `Run ${data.runId}: ${data.evidenceCreated ?? 0} contextos creados, ${data.skippedAlreadyFresh ?? 0} frescos, ${data.skippedMissingCoordinates ?? 0} sin coordenadas.`
          : source === "usgs-water"
            ? `Run ${data.runId}: ${data.evidenceCreated ?? 0} contextos hidrologicos, ${data.skippedAlreadyFresh ?? 0} frescos, ${data.skippedNoNearbyStation ?? 0} sin estacion cercana.`
          : source === "noaa"
            ? `Run ${data.runId}: ${data.inserted ?? 0} NOAA historicos nuevos, ${data.updated ?? 0} actualizados, evidencia ${data.evidenceCreated ?? 0}.`
          : source === "openfema"
            ? `Run ${data.runId}: ${data.inserted ?? 0} OpenFEMA nuevos, ${data.updated ?? 0} actualizados, evidencia ${data.evidenceCreated ?? 0}, precedentes ${data.operationalPrecedentsCreated ?? 0}.`
          : `Run ${data.runId}: ${data.inserted ?? 0} nuevos, ${data.updated ?? 0} actualizados, ${data.skipped ?? 0} omitidos.`
      );
      await refreshPersistentHealth();
    } catch (error) {
      setJobStatus("error");
      setJobMessage(error instanceof Error ? error.message : `No se pudo ejecutar ${source.toUpperCase()} persistente.`);
    }
  }

  async function refreshPersistentHealth() {
    const response = await fetch("/api/knowledge-intake/health", { cache: "no-store" });
    const data = await response.json();
    setHealthSummary(data.persistentMemory ?? null);
  }

  return (
    <div className="grid gap-6">
      <section className="rounded-lg border border-cyan-300/20 bg-slate-950/80 p-5 shadow-2xl shadow-black/35">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-cyan-200">ARGUS Knowledge Intake Engine</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Motor de aprendizaje operacional</h1>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-300">
              Absorbe fuentes abiertas, informes tecnicos, datasets y reportes para normalizar incidentes,
              medir confiabilidad, extraer lecciones y alimentar mapa, prediccion, rutas, Fenix Twin y AURA Medic Mesh.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <Metric label="Fuentes" value={stats.total} />
            <Metric label="Activas" value={stats.active} />
            <Metric label="Planificadas" value={stats.planned} />
            <Metric label="Incidentes" value={demoKnowledgeIncidents.length} />
          </div>
        </div>
        <div className="mt-5 grid gap-3 rounded-lg border border-white/10 bg-black/20 p-4 md:grid-cols-3">
          <div>
            <p className="text-xs uppercase text-emerald-200">Activas reales</p>
            <p className="mt-1 text-2xl font-semibold text-white">{realActiveSources.length}</p>
            <p className="mt-1 text-xs text-slate-400">USGS, GDACS, NASA EONET y USGS Volcano HANS activos; ReliefWeb/FIRMS quedan en stand by por configuracion.</p>
          </div>
          <div>
            <p className="text-xs uppercase text-amber-200">Stub/planificadas</p>
            <p className="mt-1 text-2xl font-semibold text-white">{stubSources.length}</p>
            <p className="mt-1 text-xs text-slate-400">Registradas sin ingesta automatica real.</p>
          </div>
          <div>
            <p className="text-xs uppercase text-rose-200">Requieren config/key</p>
            <p className="mt-1 text-2xl font-semibold text-white">{requiresKeySources.length + requiresConfigSources.length}</p>
            <p className="mt-1 text-xs text-slate-400">
              {[...requiresKeySources, ...requiresConfigSources].map((source) => source.name).join(", ") || "Ninguna"}
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-cyan-300/15 bg-cyan-400/10 p-4">
          <button
            type="button"
            onClick={() => runLiveTest("usgs")}
            disabled={liveStatus === "loading"}
            className="rounded bg-cyan-400 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
          >
            Probar USGS
          </button>
          <button
            type="button"
            onClick={() => runLiveTest("gdacs")}
            disabled={liveStatus === "loading"}
            className="rounded bg-sky-400 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
          >
            Test GDACS
          </button>
          <button
            type="button"
            onClick={() => runLiveTest("eonet")}
            disabled={liveStatus === "loading"}
            className="rounded bg-emerald-400 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
          >
            Test EONET
          </button>
          <button
            type="button"
            onClick={() => runLiveTest("hans")}
            disabled={liveStatus === "loading"}
            className="rounded bg-amber-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
          >
            Test USGS Volcano HANS
          </button>
          <input
            value={nwsQuery}
            onChange={(event) => setNwsQuery(event.target.value)}
            className="min-h-10 rounded border border-cyan-300/20 bg-slate-950 px-3 text-sm text-cyan-100 outline-none"
            aria-label="NWS query"
          />
          <button
            type="button"
            onClick={() => runLiveTest("nws")}
            disabled={liveStatus === "loading"}
            className="rounded bg-cyan-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
          >
            Test NWS
          </button>
          <input
            value={openMeteoLat}
            onChange={(event) => setOpenMeteoLat(event.target.value)}
            className="min-h-10 w-28 rounded border border-cyan-300/20 bg-slate-950 px-3 text-sm text-cyan-100 outline-none"
            aria-label="Open-Meteo latitude"
          />
          <input
            value={openMeteoLon}
            onChange={(event) => setOpenMeteoLon(event.target.value)}
            className="min-h-10 w-28 rounded border border-cyan-300/20 bg-slate-950 px-3 text-sm text-cyan-100 outline-none"
            aria-label="Open-Meteo longitude"
          />
          <select
            value={openMeteoPurpose}
            onChange={(event) => setOpenMeteoPurpose(event.target.value)}
            className="min-h-10 rounded border border-cyan-300/20 bg-slate-950 px-3 text-sm text-cyan-100 outline-none"
            aria-label="Open-Meteo purpose"
          >
            {["general", "wildfire", "flood", "nav", "aura", "fenix", "incident_context", "citizen_report_context"].map((purpose) => (
              <option key={purpose} value={purpose}>{purpose}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => runLiveTest("open-meteo")}
            disabled={liveStatus === "loading"}
            className="rounded bg-teal-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
          >
            Test Open-Meteo
          </button>
          <div className="grid w-full gap-2 rounded border border-cyan-300/20 bg-cyan-400/10 p-3 lg:grid-cols-[110px_100px_100px_90px_120px_120px_auto_auto]">
            <input
              value={usgsWaterSite}
              onChange={(event) => setUsgsWaterSite(event.target.value)}
              className="min-h-10 rounded border border-cyan-300/20 bg-slate-950 px-3 text-sm text-cyan-100 outline-none"
              aria-label="USGS Water site"
              placeholder="site"
            />
            <input
              value={usgsWaterLat}
              onChange={(event) => setUsgsWaterLat(event.target.value)}
              className="min-h-10 rounded border border-cyan-300/20 bg-slate-950 px-3 text-sm text-cyan-100 outline-none"
              aria-label="USGS Water latitude"
              placeholder="lat"
            />
            <input
              value={usgsWaterLon}
              onChange={(event) => setUsgsWaterLon(event.target.value)}
              className="min-h-10 rounded border border-cyan-300/20 bg-slate-950 px-3 text-sm text-cyan-100 outline-none"
              aria-label="USGS Water longitude"
              placeholder="lon"
            />
            <input
              value={usgsWaterRadiusKm}
              onChange={(event) => setUsgsWaterRadiusKm(event.target.value)}
              className="min-h-10 rounded border border-cyan-300/20 bg-slate-950 px-3 text-sm text-cyan-100 outline-none"
              aria-label="USGS Water radius"
            />
            <select
              value={usgsWaterPurpose}
              onChange={(event) => setUsgsWaterPurpose(event.target.value)}
              className="min-h-10 rounded border border-cyan-300/20 bg-slate-950 px-3 text-sm text-cyan-100 outline-none"
              aria-label="USGS Water purpose"
            >
              {["flood", "nav", "fenix", "aura", "incident_context", "drought", "general"].map((purpose) => (
                <option key={purpose} value={purpose}>{purpose}</option>
              ))}
            </select>
            <input
              value={usgsWaterParameters}
              onChange={(event) => setUsgsWaterParameters(event.target.value)}
              className="min-h-10 rounded border border-cyan-300/20 bg-slate-950 px-3 text-sm text-cyan-100 outline-none"
              aria-label="USGS Water parameters"
            />
            <button
              type="button"
              onClick={() => runLiveTest("usgs-water")}
              disabled={liveStatus === "loading"}
              className="rounded bg-cyan-200 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
            >
              Test USGS Water
            </button>
            <div className="flex flex-wrap items-center gap-1 text-[0.62rem] font-semibold uppercase text-cyan-100">
              <span className="rounded border border-cyan-200/20 px-2 py-1">Hydrological Context</span>
              <span className="rounded border border-cyan-200/20 px-2 py-1">Official USGS</span>
              <span className="rounded border border-cyan-200/20 px-2 py-1">Not incident source</span>
              <span className="rounded border border-cyan-200/20 px-2 py-1">Optional API key</span>
              <span className="rounded border border-cyan-200/20 px-2 py-1">Modern API preferred</span>
            </div>
          </div>
          <div className="grid w-full gap-2 rounded border border-indigo-300/20 bg-indigo-400/10 p-3 lg:grid-cols-[90px_90px_minmax(180px,1fr)_90px_auto_auto]">
            <input
              value={noaaYear}
              onChange={(event) => setNoaaYear(event.target.value)}
              className="min-h-10 rounded border border-indigo-300/20 bg-slate-950 px-3 text-sm text-indigo-100 outline-none"
              aria-label="NOAA Storm Events year"
            />
            <input
              value={noaaState}
              onChange={(event) => setNoaaState(event.target.value.toUpperCase())}
              className="min-h-10 rounded border border-indigo-300/20 bg-slate-950 px-3 text-sm text-indigo-100 outline-none"
              aria-label="NOAA Storm Events state"
            />
            <input
              value={noaaEventTypes}
              onChange={(event) => setNoaaEventTypes(event.target.value)}
              className="min-h-10 rounded border border-indigo-300/20 bg-slate-950 px-3 text-sm text-indigo-100 outline-none"
              aria-label="NOAA Storm Events event types"
            />
            <input
              value={noaaLimit}
              onChange={(event) => setNoaaLimit(event.target.value)}
              className="min-h-10 rounded border border-indigo-300/20 bg-slate-950 px-3 text-sm text-indigo-100 outline-none"
              aria-label="NOAA Storm Events limit"
            />
            <button
              type="button"
              onClick={() => runLiveTest("noaa")}
              disabled={liveStatus === "loading"}
              className="rounded bg-indigo-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
            >
              Preview NOAA Storm Events
            </button>
            <div className="flex flex-wrap items-center gap-1 text-[0.62rem] font-semibold uppercase text-indigo-100">
              <span className="rounded border border-indigo-200/20 px-2 py-1">Historical dataset</span>
              <span className="rounded border border-indigo-200/20 px-2 py-1">Not live</span>
              <span className="rounded border border-indigo-200/20 px-2 py-1">Controlled import</span>
              <span className="rounded border border-amber-200/30 px-2 py-1 text-amber-100">Data quality caution</span>
            </div>
          </div>
          <div className="grid w-full gap-2 rounded border border-sky-300/20 bg-sky-400/10 p-3 lg:grid-cols-[90px_90px_minmax(160px,1fr)_130px_90px_auto_auto]">
            <input
              value={openFemaYear}
              onChange={(event) => setOpenFemaYear(event.target.value)}
              className="min-h-10 rounded border border-sky-300/20 bg-slate-950 px-3 text-sm text-sky-100 outline-none"
              aria-label="OpenFEMA year"
            />
            <input
              value={openFemaState}
              onChange={(event) => setOpenFemaState(event.target.value.toUpperCase())}
              className="min-h-10 rounded border border-sky-300/20 bg-slate-950 px-3 text-sm text-sky-100 outline-none"
              aria-label="OpenFEMA state"
            />
            <input
              value={openFemaIncidentTypes}
              onChange={(event) => setOpenFemaIncidentTypes(event.target.value)}
              className="min-h-10 rounded border border-sky-300/20 bg-slate-950 px-3 text-sm text-sky-100 outline-none"
              aria-label="OpenFEMA incident types"
            />
            <input
              value={openFemaDisasterNumber}
              onChange={(event) => setOpenFemaDisasterNumber(event.target.value)}
              className="min-h-10 rounded border border-sky-300/20 bg-slate-950 px-3 text-sm text-sky-100 outline-none"
              aria-label="OpenFEMA disaster number"
              placeholder="disaster #"
            />
            <input
              value={openFemaLimit}
              onChange={(event) => setOpenFemaLimit(event.target.value)}
              className="min-h-10 rounded border border-sky-300/20 bg-slate-950 px-3 text-sm text-sky-100 outline-none"
              aria-label="OpenFEMA limit"
            />
            <button
              type="button"
              onClick={() => runLiveTest("openfema")}
              disabled={liveStatus === "loading"}
              className="rounded bg-sky-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
            >
              Preview OpenFEMA
            </button>
            <div className="flex flex-wrap items-center gap-1 text-[0.62rem] font-semibold uppercase text-sky-100">
              <span className="rounded border border-sky-200/20 px-2 py-1">Institutional dataset</span>
              <span className="rounded border border-sky-200/20 px-2 py-1">Not live sensor</span>
              <span className="rounded border border-sky-200/20 px-2 py-1">Disaster declarations</span>
              <span className="rounded border border-sky-200/20 px-2 py-1">Controlled import</span>
              <span className="rounded border border-emerald-200/30 px-2 py-1 text-emerald-100">ARGUS learns from FEMA precedents</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => runLiveTest("reliefweb")}
            disabled={liveStatus === "loading"}
            className="rounded border border-cyan-300/30 bg-slate-950 px-4 py-2 text-sm font-semibold text-cyan-100 disabled:cursor-wait disabled:opacity-60"
          >
            Probar ReliefWeb
          </button>
          <span className={`text-sm ${liveStatus === "error" ? "text-rose-100" : liveStatus === "ready" ? "text-emerald-100" : "text-slate-300"}`}>
            {liveMessage}
          </span>
        </div>
        <div className="mt-4 grid gap-3 rounded-lg border border-emerald-300/15 bg-emerald-400/10 p-4 lg:grid-cols-[auto_auto_minmax(0,1fr)]">
          <button
            type="button"
            onClick={() => runPersistentJob("usgs")}
            disabled={jobStatus === "loading"}
            className="rounded bg-emerald-400 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
          >
            Run USGS ingestion
          </button>
          <button
            type="button"
            onClick={() => runPersistentJob("gdacs")}
            disabled={jobStatus === "loading"}
            className="rounded bg-sky-400 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
          >
            Run GDACS ingestion
          </button>
          <button
            type="button"
            onClick={() => runPersistentJob("eonet")}
            disabled={jobStatus === "loading"}
            className="rounded bg-emerald-400 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
          >
            Run EONET ingestion
          </button>
          <button
            type="button"
            onClick={() => runPersistentJob("hans")}
            disabled={jobStatus === "loading"}
            className="rounded bg-amber-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
          >
            Run USGS Volcano HANS ingestion
          </button>
          <button
            type="button"
            onClick={() => runPersistentJob("nws")}
            disabled={jobStatus === "loading"}
            className="rounded bg-cyan-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
          >
            Run NWS ingestion
          </button>
          <button
            type="button"
            onClick={() => runPersistentJob("open-meteo")}
            disabled={jobStatus === "loading"}
            className="rounded bg-teal-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
          >
            Run Open-Meteo context enrichment
          </button>
          <button
            type="button"
            onClick={() => runPersistentJob("usgs-water")}
            disabled={jobStatus === "loading"}
            className="rounded bg-cyan-200 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
          >
            Run USGS Water context
          </button>
          <button
            type="button"
            onClick={() => runPersistentJob("noaa")}
            disabled={jobStatus === "loading"}
            className="rounded bg-indigo-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
          >
            Import NOAA Storm Events
          </button>
          <button
            type="button"
            onClick={() => runPersistentJob("openfema")}
            disabled={jobStatus === "loading"}
            className="rounded bg-sky-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
          >
            Import OpenFEMA declarations
          </button>
          <button
            type="button"
            onClick={refreshPersistentHealth}
            className="rounded border border-emerald-300/30 bg-slate-950 px-4 py-2 text-sm font-semibold text-emerald-100"
          >
            Actualizar memoria
          </button>
          <span className={`text-sm ${jobStatus === "error" ? "text-rose-100" : jobStatus === "ready" ? "text-emerald-100" : "text-slate-300"}`}>
            {jobMessage}
          </span>
        </div>
        <div className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-xs leading-5 text-amber-100">
          USGS monitored volcanoes; global architecture supports additional regional volcano sources. HANS conserva alertLevel terrestre y aviationColorCode como senales separadas, sin ordenes automaticas.
        </div>
        <div className="mt-3 rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-3 text-xs leading-5 text-cyan-100">
          NWS Weather Alerts: United States and NWS territories; global architecture supports additional weather sources.
        </div>
        <div className="mt-3 rounded-lg border border-teal-300/20 bg-teal-300/10 p-3 text-xs leading-5 text-teal-100">
          Open-Meteo Weather Context: contextual source, global coverage, no API key. Commercial use requires review. It does not create incidents or official alerts.
        </div>
        <div className="mt-3 rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-3 text-xs leading-5 text-cyan-100">
          USGS Water Conditions: official USGS hydrological context for United States and USGS monitored locations. Parameters 00060 streamflow and 00065 gage height; not a forecast, incident source, evacuation order or route closure.
        </div>
        <div className="mt-3 rounded-lg border border-indigo-300/20 bg-indigo-300/10 p-3 text-xs leading-5 text-indigo-100">
          NOAA Storm Events Historical: NOAA/NCEI official historical severe-weather records for United States and NOAA/NWS territories. Controlled import by year/state/event type/limit only; do not import all history at once or treat it as live alerts.
        </div>
        <div className="mt-3 rounded-lg border border-sky-300/20 bg-sky-300/10 p-3 text-xs leading-5 text-sky-100">
          OpenFEMA Disaster Declarations: FEMA/OpenFEMA institutional records for United States and FEMA territories. FEMA precedent supports ARGUS recommendations but does not create official FEMA instructions or promise federal assistance.
        </div>
        <div className="mt-5">
          <KnowledgeDomainFilter value={filter} onChange={setFilter} />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="grid gap-6">
          <KnowledgeInputUploadPanel sources={sources} onPreview={setPreviewIncident} />
          {previewIncident && (
            <section className="rounded-lg border border-amber-300/20 bg-amber-400/10 p-4 text-sm text-amber-100">
              Vista previa normalizada localmente. No fue guardada ni enviada a una fuente externa.
            </section>
          )}
          <div className="grid gap-4">
            {(previewIncident ? [previewIncident, ...liveIncidents, ...filteredIncidents] : [...liveIncidents, ...filteredIncidents]).slice(0, 8).map((incident) => (
              <IncidentKnowledgeCard key={incident.id} incident={incident} />
            ))}
          </div>
          <KnowledgeSourceRegistryPanel sources={sources} />
        </div>
        <aside className="grid h-fit gap-6">
          <section className="rounded-lg border border-white/10 bg-slate-950/75 p-5">
            <p className="text-xs font-semibold uppercase text-cyan-200">Dominios con informacion</p>
            <div className="mt-4 grid gap-2">
              {domainStats.map(([domain, count]) => (
                <div key={domain} className="flex items-center justify-between rounded border border-white/10 bg-black/20 px-3 py-2 text-sm">
                  <span className="text-slate-200">{domain}</span>
                  <span className="font-semibold text-cyan-100">{count}</span>
                </div>
              ))}
            </div>
          </section>
          <section className="rounded-lg border border-white/10 bg-slate-950/75 p-5">
            <p className="text-xs font-semibold uppercase text-emerald-200">Memoria persistente</p>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <Metric label="Incidentes DB" value={healthSummary?.persistedIncidents ?? 0} />
              <Metric label="Docs DB" value={healthSummary?.persistedDocuments ?? 0} />
              <Metric label="Lecciones DB" value={healthSummary?.persistedLessons ?? 0} />
              <Metric label="Pendientes" value={healthSummary?.pendingReviews ?? 0} />
            </div>
            <div className="mt-4 grid gap-2">
              {(healthSummary?.latestIngestionRuns ?? []).slice(0, 4).map((run) => (
                <div key={run.id} className="rounded border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300">
                  <span className="font-semibold text-white">{run.sourceId}</span> · {run.status} · +{run.recordsInserted ?? 0} / ~{run.recordsUpdated ?? 0} / skip {run.recordsSkipped ?? 0}
                </div>
              ))}
              {!healthSummary && <p className="text-xs text-slate-500">Pulsa Actualizar memoria para consultar DB.</p>}
            </div>
          </section>
          <section className="rounded-lg border border-amber-300/20 bg-amber-400/10 p-4 text-xs leading-5 text-amber-100">
            GDACS y NASA EONET son fuentes globales de awareness. NWS es fuente oficial para Estados Unidos y territorios NWS, no cobertura mundial completa. ReliefWeb requiere appname aprobado, FIRMS requiere MAP_KEY.
          </section>
          <SimilarIncidentsPanel incident={selectedIncident} />
          <LessonsLearnedPanel domain={selectedIncident.domain} />
          <section className="rounded-lg border border-rose-300/20 bg-rose-400/10 p-4 text-xs leading-5 text-rose-100">
            Las recomendaciones del modulo son informativas. No usar fuentes de baja confianza para decisiones criticas sin validacion humana e institucional.
          </section>
        </aside>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-white/10 bg-black/20 px-3 py-2">
      <p className="text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}
