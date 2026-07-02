"use client";

import { useMemo, useState } from "react";
import { normalizeKnowledgeInput } from "@/lib/knowledge-intake/incidentNormalizer";
import type { ArgusHazardDomain, ArgusIncidentKnowledge, ArgusKnowledgeSource } from "@/types/knowledgeIntake";

const domains: ArgusHazardDomain[] = [
  "road_accident",
  "urban_fire",
  "wildfire",
  "earthquake",
  "tsunami",
  "chemical_accident",
  "nuclear_radiological",
  "industrial_accident",
  "flood",
];

export default function KnowledgeInputUploadPanel({
  sources,
  onPreview,
}: {
  sources: ArgusKnowledgeSource[];
  onPreview: (incident: ArgusIncidentKnowledge) => void;
}) {
  const [rawText, setRawText] = useState("Incendio industrial con humo visible, ruta afectada y posible exposicion a quimicos en Chile.");
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? "manual_input");
  const [domain, setDomain] = useState<ArgusHazardDomain>("industrial_accident");
  const [country, setCountry] = useState("CL");
  const selectedSource = useMemo(() => sources.find((source) => source.id === sourceId), [sourceId, sources]);

  function handlePreview() {
    const incident = normalizeKnowledgeInput({
      id: `ui-manual-${rawText.length}`,
      inputType: "manual_admin",
      sourceId,
      sourceName: selectedSource?.name ?? "Manual input",
      ingestionMode: "manual",
      rawText,
      rawMetadata: { selectedDomain: domain, documentKind: "historical_or_active_report" },
      language: "es",
      country,
      receivedAt: "2026-07-02T00:00:00.000Z",
      processingStatus: "normalized",
      tags: [domain, "ui-preview"],
    });
    onPreview(incident);
  }

  return (
    <section className="rounded-lg border border-cyan-300/15 bg-slate-950/75 p-5 shadow-xl shadow-black/30">
      <p className="text-xs font-semibold uppercase text-cyan-200">Manual Intake</p>
      <h2 className="mt-1 text-xl font-semibold text-white">Carga y normalizacion local</h2>
      <div className="mt-5 grid gap-4">
        <textarea
          value={rawText}
          onChange={(event) => setRawText(event.target.value)}
          className="min-h-32 rounded border border-white/10 bg-black/30 px-3 py-3 text-sm text-white outline-none focus:border-cyan-300/60"
          placeholder="Pegar texto, URL o resumen tecnico..."
        />
        <div className="grid gap-3 md:grid-cols-3">
          <select value={sourceId} onChange={(event) => setSourceId(event.target.value)} className="rounded border border-white/10 bg-slate-900 px-3 py-3 text-sm text-white">
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </select>
          <select value={domain} onChange={(event) => setDomain(event.target.value as ArgusHazardDomain)} className="rounded border border-white/10 bg-slate-900 px-3 py-3 text-sm text-white">
            {domains.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <input value={country} onChange={(event) => setCountry(event.target.value)} className="rounded border border-white/10 bg-slate-900 px-3 py-3 text-sm text-white" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={handlePreview} className="rounded bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 hover:bg-cyan-300">
            Normalizar vista previa
          </button>
          <span className="text-xs text-slate-400">PDF, DOCX, XLSX, OCR y almacenamiento quedan como stubs planificados.</span>
        </div>
      </div>
    </section>
  );
}
