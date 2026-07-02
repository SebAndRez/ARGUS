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
