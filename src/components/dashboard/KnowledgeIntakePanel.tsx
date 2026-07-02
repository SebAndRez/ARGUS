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
  const realActiveSources = sources.filter((source) => source.status === "active");
  const stubSources = sources.filter((source) => source.status === "planned" || source.status === "stub");
  const requiresKeySources = sources.filter((source) => source.status === "requiresApiKey");
  const requiresConfigSources = sources.filter((source) => source.status === "requiresConfiguration");
  async function runLiveTest(source: "usgs" | "reliefweb") {
    setLiveStatus("loading");
    setLiveMessage(`Probando ${source.toUpperCase()}...`);
    try {
      const endpoint =
        source === "usgs"
          ? "/api/knowledge-intake/live/usgs?feed=relevant&limit=8"
          : "/api/knowledge-intake/live/reliefweb?limit=6";
      const response = await fetch(endpoint, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? data.error ?? `Fallo ${source}`);
      setLiveIncidents(data.incidents ?? []);
      setLiveStatus("ready");
      setLiveMessage(`${data.sourceName ?? source} entrego ${data.count ?? 0} incidente(s) normalizado(s).`);
    } catch (error) {
      setLiveStatus("error");
      setLiveMessage(error instanceof Error ? error.message : "No se pudo ejecutar prueba en vivo.");
    }
  }

  async function runPersistentUsgsJob() {
    setJobStatus("loading");
    setJobMessage("Ejecutando USGS persistente...");
    try {
      const response = await fetch("/api/knowledge-intake/jobs/run-usgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedType: "relevant", limit: 25 }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "USGS persistent job failed");
      setJobStatus("ready");
      setJobMessage(
        `Run ${data.runId}: ${data.inserted ?? 0} nuevos, ${data.updated ?? 0} actualizados, ${data.skipped ?? 0} omitidos.`
      );
      await refreshPersistentHealth();
    } catch (error) {
      setJobStatus("error");
      setJobMessage(error instanceof Error ? error.message : "No se pudo ejecutar USGS persistente.");
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
            <p className="mt-1 text-xs text-slate-400">USGS, ReliefWeb y fuentes ya operativas del ecosistema.</p>
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
            onClick={runPersistentUsgsJob}
            disabled={jobStatus === "loading"}
            className="rounded bg-emerald-400 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
          >
            Run USGS ingestion
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
            Capacidades pendientes: ReliefWeb requiere appname aprobado, FIRMS requiere MAP_KEY, OCR/storage/pgvector/scheduler externo siguen planificados.
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
